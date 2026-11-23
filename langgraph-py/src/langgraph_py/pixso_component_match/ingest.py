# /// script
# requires-python = ">=3.13,<3.14"
# dependencies = [
#   "langgraph==1.2.14",
#   "pymilvus==3.0.2",
#   "milvus-lite==3.2.2",
#   "faiss-cpu==1.15.1; sys_platform == 'darwin'",
#   "llama-index-embeddings-openai-like==0.4.0",
#   "python-dotenv==1.2.4",
#   "openai>=1,<3",
# ]
# ///
"""从本机组件库、文档和图例构建可追溯的 Milvus 索引。"""

import argparse
import base64
import fcntl
import json
import math
import mimetypes
import os
import re
import sys
import tempfile
from contextlib import closing, contextmanager
from time import monotonic
from pathlib import Path
from typing import TypedDict

from dotenv import load_dotenv
from langgraph.graph import END, START, StateGraph
from langsmith import tracing_context
from llama_index.embeddings.openai_like import OpenAILikeEmbedding
from openai import OpenAI
from pymilvus import DataType, MilvusClient
from pymilvus.exceptions import ConnectionConfigException

if __package__:
    from .catalog import digest, discover
else:
    from catalog import digest, discover


@contextmanager
def component_database(uri):
    """Share a local index between CLI and Studio workers for the duration of each operation."""
    if "://" in uri or not uri.endswith(".db"):
        with closing(MilvusClient(uri=uri)) as client:
            yield client
        return

    from milvus_lite.server_manager import server_manager_instance

    path = Path(uri).expanduser().resolve()
    # Milvus Lite keeps its embedded server (and database lock) after client.close().
    # Serialize its full lifetime per database, including startup and shutdown.
    with path.with_name(path.name + ".access.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            try:
                client = MilvusClient(uri=str(path), dedicated=True)
            except ConnectionConfigException as exc:
                raise RuntimeError(
                    f"无法打开本机 Milvus Lite 数据库 {path}。请检查目录权限及其他进程的占用情况。"
                    f"底层错误：{exc}"
                ) from exc
            with closing(client):
                yield client
        finally:
            server_manager_instance.release_server(str(path))


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def progress(message):
    print(message, file=sys.stderr, flush=True)


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as tmp:
        scratch = Path(tmp.name)
        try:
            tmp.write(data)
            tmp.flush()
            os.fsync(tmp.fileno())
            tmp.close()
            scratch.replace(path)
        finally:
            scratch.unlink(missing_ok=True)


class State(TypedDict, total=False):
    catalog: dict
    rows: list
    report: dict


def component_vision_model():
    return os.getenv("COMPONENT_VISION_MODEL") or os.getenv("OPENAI_DEFAULT_MODEL")


def vision_client(**options):
    return OpenAI(api_key=os.getenv("COMPONENT_VISION_API_KEY") or os.getenv("OPENAI_API_KEY"),
                  base_url=os.getenv("COMPONENT_VISION_BASE_URL") or os.getenv("OPENAI_BASE_URL"),
                  **options)


def describe_figures(catalog, output, vision_model):
    client = None
    if vision_model:
        client = vision_client()
    for component in catalog["components"].values():
        for fig in component["figures"]:
            fig["description"] = fig["caption"]
            fig["description_source"] = "document" if fig["caption"] else "unavailable"
            if not client:
                if not fig["caption"]:
                    catalog["skipped"].append(f"{fig['path']}：已关联图例，缺少文字说明或视觉模型")
                continue
            pic = catalog["sources"][fig["path"]]
            cache_key = digest(encoded(["visual-features-v1", str(client.base_url), vision_model, pic["hash"]]))
            cache = output / "captions" / f"{cache_key}.txt"
            if not cache.is_file():
                mime = mimetypes.guess_type(fig["path"])[0]
                url = f"data:{mime};base64," + base64.b64encode(pic["data"]).decode()
                reply = client.chat.completions.create(model=vision_model, messages=[{
                    "role": "user", "content": [
                        {"type": "text", "text": "用简短中文描述图中控件的布局、形状和可见选中态。只描述可见特征。"},
                        {"type": "image_url", "image_url": {"url": url}},
                    ]}])
                caption = reply.choices[0].message.content
                if not caption or not caption.strip():
                    raise ValueError(f"视觉模型对 {fig['path']} 返回空描述")
                atomic_write(cache, caption.strip().encode())
            fig["description"] = cache.read_text()
            fig["description_source"] = vision_model


def build_rows(catalog):
    rows = []
    for cid, component in sorted(catalog["components"].items()):
        evidence = component["evidence"]
        # Keep independent code, API and documentation excerpts for the shared baseline.
        parts = []
        for kind in ("overview", "api", "code", "example", "constraint"):
            for item in evidence:
                if item["kind"] != kind:
                    continue
                body = item["text"]
                if item["path"].lower().endswith((".md", ".mdx")):
                    body = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", body)
                parts.append(body[:500])
                break
        readme_titles = dict.fromkeys(item["title"] for item in evidence
                                      if Path(item["path"]).stem.casefold() == "readme" and item["title"])
        if readme_titles:
            parts.append("README 章节：" + "、".join(readme_titles)[:800])
        prefix = f"{component['name']} ({cid})"
        summary = prefix + "\n" + "\n".join(parts)
        for i, item in enumerate(evidence):
            rows.append(dict(component_id=cid, kind=item["kind"], mode="evidence", ref=f"evidence/{i}",
                             text=f"{prefix}\n{item['title']}\n{item['text']}"))
        for i, figure in enumerate(component["figures"] or [None]):
            visual = figure["description"] if figure else ""
            ref = f"figures/{i}" if figure else "component"
            variant_summary = summary
            if figure and figure.get("source") and figure["title"]:
                variant_summary += "\n用例：" + figure["title"]
            for mode, addition in (("text", ""), ("text_image", visual)):
                rows.append(dict(component_id=cid, kind="summary", mode=mode, ref=ref,
                                 text=variant_summary + ("\n图例：" + addition[:1500] if addition else "")))
    return rows


def ensure_collection(client, name, dim):
    if not client.has_collection(name):
        schema = client.create_schema(auto_id=False, enable_dynamic_field=False)
        for field, size in {"id": 64, "library": 512, "release": 256, "build_id": 64,
                            "component_id": 2048, "kind": 32, "mode": 32, "ref": 80,
                            "text": 60000}.items():
            schema.add_field(field, DataType.VARCHAR, max_length=size, is_primary=field == "id")
        schema.add_field("dense", DataType.FLOAT_VECTOR, dim=dim)
        indexes = client.prepare_index_params()
        indexes.add_index(field_name="dense", index_type="FLAT", metric_type="COSINE")
        client.create_collection(name, schema=schema, index_params=indexes)
    client.load_collection(name)


def model_settings():
    names = ("EDU_EMBED_BASE_URL", "EDU_EMBED_MODEL", "EDU_EMBED_API_KEY")
    missing = [name for name in names if not os.getenv(name, "").strip()]
    if missing:
        raise ValueError("缺少 embedding 配置 " + ", ".join(missing))
    return [os.environ[name].strip() for name in names]


def collection_for_model(base, model, dim):
    model_id = digest(encoded([base.rstrip("/"), model, os.getenv("EDU_EMBED_VERSION", ""), dim]))[:16]
    return f"component_chunks_{model_id}"


def publish(catalog, rows, args):
    base, model, secret = model_settings()
    embed = OpenAILikeEmbedding(model_name=model, api_base=base.rstrip("/"), api_key=secret,
                                embed_batch_size=args.batch_size)
    progress(f"已准备 {len(rows)} 条记录，正在连接 embedding 服务并确认向量维度…")
    dim = len(embed.get_query_embedding("组件检索"))
    if dim == 0:
        raise ValueError("embedding 服务返回空向量")
    collection = collection_for_model(base, model, dim)
    output = args.output
    sources = {}
    for source, item in catalog["sources"].items():
        blob = Path("snapshots") / (item["hash"] + Path(source).suffix.lower())
        if not (output / blob).exists():
            atomic_write(output / blob, item["data"])
        sources[source] = dict(sha256=item["hash"], snapshot=str(blob))
    library = catalog["library"]
    release = catalog["release"] or "snapshot-" + digest(encoded(sources))[:12]
    manifest = dict(schema_version=1, library=library, release=release, collection=collection,
                    embedding_model=model, dimension=dim, components=catalog["components"], sources=sources)
    build = digest(encoded([manifest, rows]))
    manifest["build_id"] = build
    progress("正在连接 Milvus 并加载组件集合…")
    scope = f'build_id == "{build}"'
    with component_database(args.uri) as client:
        ensure_collection(client, collection, dim)
        written = 0
        last_update = monotonic()
        progress(f"正在核对已有记录并写入缺少的向量（0/{len(rows)}）…")
        for start in range(0, len(rows), args.batch_size):
            batch = rows[start:start+args.batch_size]
            stored = []
            for row in batch:
                record_id = digest(encoded([build, row["component_id"], row["mode"], row["ref"]]))
                stored.append(dict(**row, id=record_id, build_id=build, library=library, release=release))
            ids = [r["id"] for r in stored]
            existing = client.get(collection_name=collection, ids=ids, output_fields=["id"],
                                  consistency_level="Strong")
            present = {r["id"] for r in existing}
            pending = [r for r in stored if r["id"] not in present]
            if pending:
                vectors = embed.get_text_embedding_batch([r["text"] for r in pending])
                for row, vector in zip(pending, vectors, strict=True):
                    if len(vector) != dim or not all(map(math.isfinite, vector)):
                        raise ValueError("embedding 批次含有无效向量或维度不一致")
                    row["dense"] = vector
                client.upsert(collection_name=collection, data=pending)
                written += len(pending)
            done = start + len(batch)
            if done == len(rows) or monotonic() - last_update >= 3:
                progress(f"已处理 {done}/{len(rows)} 条，本次写入 {written} 条，复用 {done-written} 条。")
                last_update = monotonic()
        progress("正在校验记录数、来源快照并发布构建清单…")
        client.flush(collection_name=collection)
        count = client.query(collection_name=collection, filter=scope, output_fields=["count(*)"],
                             consistency_level="Strong")[0]["count(*)"]
        if count != len(rows):
            raise ValueError(f"构建记录数不匹配：预期 {len(rows)}，实际 {count}")
        hit = client.query(collection_name=collection, filter=scope + ' and mode == "evidence"', limit=1,
                           output_fields=["component_id", "ref"], consistency_level="Strong")[0]
    for path, source in sources.items():
        if digest((output / source["snapshot"]).read_bytes()) != source["sha256"]:
            raise ValueError(f"快照校验失败：{path}")
    cid = hit["component_id"]
    item = manifest["components"][cid]["evidence"][int(hit["ref"].split("/")[1])]
    snapshot = output / sources[item["path"]]["snapshot"]
    lines = snapshot.read_text(encoding="utf-8-sig").splitlines()
    if item["text"] not in "\n".join(lines[item["start"]-1:item["end"]]):
        raise ValueError(f"回读原文与片段不一致：{item['path']}")
    manifest_path = output / "builds" / f"{build}.json"
    active = output / "active" / (digest(encoded([library, release])) + ".json")
    report = dict(library=library, release=release, collection=collection, build_id=build,
                  components=len(catalog["components"]), records=count,
                  evidence_chunks=sum(r["mode"] == "evidence" for r in rows),
                  readme_files=sum(Path(p).name.casefold() in {"readme.md", "readme.mdx"} for p in sources),
                  figures=len({f["path"] for c in catalog["components"].values() for f in c["figures"]}),
                  manifest=str(manifest_path), active_manifest=str(active), skipped=catalog["skipped"],
                  verified_sample=dict(component_id=cid, path=item["path"], line=item["start"], snapshot=str(snapshot)))
    atomic_write(manifest_path, encoded(manifest))
    atomic_write(active, encoded(dict(build_id=build, collection=collection, manifest=str(manifest_path))))
    return report


def build_graph(args):
    def scan(_):
        progress(f"正在扫描组件、README 和示例：{args.source}")
        return {"catalog": discover(args.source, args.docs, args.images, args.output)}

    def prepare(state):
        catalog = state["catalog"]
        figures = sum(len(c["figures"]) for c in catalog["components"].values())
        progress(f"发现 {len(catalog['components'])} 个组件、{figures} 个关联图例，正在准备检索片段…")
        describe_figures(catalog, args.output, args.vision_model)
        return {"catalog": catalog, "rows": build_rows(catalog)}

    def write(state):
        return {"report": publish(state["catalog"], state["rows"], args)}

    graph = StateGraph(State)
    graph.add_node("discover_components", scan)
    graph.add_node("prepare_embeddings", prepare)
    graph.add_node("index_and_verify", write)
    graph.add_edge(START, "discover_components")
    graph.add_edge("discover_components", "prepare_embeddings")
    graph.add_edge("prepare_embeddings", "index_and_verify")
    graph.add_edge("index_and_verify", END)
    return graph.compile()


def main():
    project = Path(__file__).resolve().parents[3]
    load_dotenv(project / ".env")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="单个组件包根目录或 Markdown/MDX 文档目录")
    parser.add_argument("--docs", type=Path, help="独立的组件文档目录")
    parser.add_argument("--images", type=Path, help="独立的图例目录")
    parser.add_argument("--output", type=Path, default=project / ".component-index", help="快照与构建清单目录")
    parser.add_argument("--uri", default=os.getenv("COMPONENT_MILVUS_URI") or os.getenv("EDU_MILVUS_URI"),
                        help="Milvus 地址，默认在输出目录创建 components.db")
    vision = parser.add_mutually_exclusive_group()
    vision.add_argument("--vision-model", default=component_vision_model(),
                        help="读取组件图例的模型，默认沿用仓库聊天模型")
    vision.add_argument("--no-vision", dest="vision_model", action="store_const", const=None,
                        help="图例仅使用文档中已有的图片说明")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--trace", action="store_true", help="为本次入库启用 LangSmith 追踪")
    args = parser.parse_args()
    for field in ("source", "docs", "images"):
        path = getattr(args, field)
        if path is not None:
            path = path.expanduser().resolve()
            if not path.is_dir():
                parser.error(f"无效目录：{path}")
            setattr(args, field, path)
    if args.batch_size <= 0:
        parser.error("--batch-size 需要大于零")
    args.output = args.output.expanduser().resolve()
    if any(p and p.is_relative_to(args.output) for p in (args.source, args.docs, args.images)):
        parser.error("输出目录不能等于或包含输入目录")
    args.uri = args.uri or str(args.output / "components.db")
    args.output.mkdir(parents=True, exist_ok=True)
    with (args.output / ".ingest.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            progress(f"另一个入库任务正在使用 {args.output}，正在等待…")
            fcntl.flock(lock, fcntl.LOCK_EX)
        with tracing_context(enabled=args.trace):
            result = build_graph(args).invoke({})
    print(json.dumps(result["report"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        progress("入库已中断。重新运行同一命令可复用已写入的有效记录。")
        sys.exit(130)
