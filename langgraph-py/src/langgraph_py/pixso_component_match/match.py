"""按 Pixso 设计区域检索已入库的候选组件。"""
import argparse
import asyncio
import json
import math
import re
import os
import sys
from concurrent.futures import Future
from threading import Lock
from uuid import uuid4
from pathlib import Path
from typing import Literal, TypedDict
from urllib.parse import parse_qs, urlencode, urlsplit

from dotenv import load_dotenv
from langgraph.graph import END, START, StateGraph
from langchain_core.runnables.config import get_executor_for_config
from langsmith import tracing_context
from llama_index.embeddings.openai_like import OpenAILikeEmbedding
from pymilvus import MilvusClient

from .catalog import digest
from .ingest import atomic_write, collection_for_model, encoded, model_settings, progress
from .pixso import capture_regions, design_roots, fetch_dsl, visible_nodes
from .regions import is_navigation_name, partition
from .proof import ask_json, confirmed_match, markdown_report


def active_builds(index, library, release):
    choices = []
    for pointer in sorted((index / "active").glob("*.json")):
        head = json.loads(pointer.read_bytes())
        path = index / "builds" / (head["build_id"] + ".json")
        manifest = json.loads(path.read_bytes())
        if head["build_id"] != manifest["build_id"] or head["collection"] != manifest["collection"]:
            raise ValueError(f"活动指针与构建清单不一致：{pointer}")
        if (not library or manifest["library"] == library) and (not release or manifest["release"] == release):
            choices.append((manifest, path))
    if not choices:
        raise ValueError(f"在 {index}/active 找不到匹配的已发布索引，请核对目录、组件库和版本")
    libraries = [manifest["library"] for manifest, _ in choices]
    if len(set(libraries)) != len(libraries):
        raise ValueError("同一组件库存在多个活动版本，请指定 library 和 release")
    return choices


def public_candidates(manifests):
    """Prefer package exports where a loose directory indexes the same source tree."""
    package_dirs = set()
    for manifest in manifests:
        if not manifest["release"].startswith("snapshot-"):
            for source in manifest["sources"]:
                parent = next((p for p in Path(source).parents if (p / "package.json").is_file()), None)
                if parent:
                    package_dirs.add(parent)
    result = {}
    for manifest in manifests:
        allowed = []
        for cid, component in manifest["components"].items():
            files = [Path(e["path"]) for e in component["evidence"]]
            if not files or any(re.match(r"\s*export\s+(?:const\s+)?enum\s+", e["text"])
                                for e in component["evidence"] if e["kind"] == "code" and component["name"].isupper()):
                continue
            if all({"demos", "examples", "stories"}.intersection(p.parts) for p in files):
                continue
            if manifest["release"].startswith("snapshot-") and all(
                    any(d in path.parents for d in package_dirs) for path in files):
                continue
            allowed.append(cid)
        result[manifest["build_id"]] = allowed
    return result


def candidates(client, manifest, vector, top_k, mode, allowed):
    if not allowed:
        return []
    scope = {"library": manifest["library"], "release": manifest["release"], "build_id": manifest["build_id"],
             "kind": "summary", "mode": mode}
    expr = " and ".join(f"{field} == {json.dumps(value, ensure_ascii=False)}" for field, value in scope.items())
    expr += " and component_id in " + json.dumps(allowed, ensure_ascii=False)
    limit = max(20, top_k)
    while True:
        hits = client.search(collection_name=manifest["collection"], data=[vector], anns_field="dense",
                             filter=expr, limit=limit, search_params={"metric_type": "COSINE"},
                             output_fields=["component_id", "ref", "text"], consistency_level="Strong")[0]
        found = {}
        for hit in hits:
            entity = hit["entity"]
            cid = entity["component_id"]
            if cid in found:
                continue
            component = manifest["components"][cid]
            ref = entity["ref"]
            figure = None
            if ref.startswith("figures/"):
                figure = component["figures"][int(ref.split("/")[1])]
            found[cid] = dict(component_id=cid, name=component["name"], import_path=component["import_path"],
                              library=manifest["library"], release=manifest["release"], build_id=manifest["build_id"],
                              score=float(hit["distance"]), summary=entity["text"], ref=ref, figure=figure)
            if len(found) == top_k:
                break
        if len(found) == top_k or len(hits) < limit or limit >= 16384:
            return list(found.values())
        limit = min(limit * 2, 16384)


PROJECT = Path(__file__).resolve().parents[3]
DEFAULT_MCP_URL = "http://127.0.0.1:3667/mcp"


class Request(TypedDict, total=False):
    design_json: dict | list
    json_path: str
    design_url: str
    mcp_url: str
    tool_args: dict
    transport: Literal["http", "sse"]
    library: str
    release: str
    top_k: int
    mode: Literal["text", "text_image"]
    structure_only: bool
    requirements: dict[str, list[str]]
    screenshots: bool
    index: str
    uri: str


class MatchInput(TypedDict):
    request: Request


class StudioInput(TypedDict):
    design_url: str


class MatchOutput(TypedDict):
    report: dict


class MatchState(MatchInput, total=False):
    snapshot: str
    manifest_paths: list[str]
    run_key: str
    regions: list
    notes: list
    extra: dict
    matches: list
    report: dict


def input_options(request):
    index = Path(request.get("index") or PROJECT / ".component-index").expanduser().resolve()
    uri = request.get("uri") or os.getenv("COMPONENT_MILVUS_URI") or os.getenv("EDU_MILVUS_URI")
    return index, uri or str(index / "components.db")


def read_design(state):
    req = state["request"]
    index, _ = input_options(req)
    builds = active_builds(index, req.get("library"), req.get("release"))
    if req.get("mode", "text_image") not in {"text", "text_image"} or not 1 <= req.get("top_k", 3) <= 100:
        raise ValueError("mode 应为 text 或 text_image，top_k 范围为 1–100")
    if not isinstance(req.get("tool_args", {}), dict) or req.get("transport") not in (None, "http", "sse"):
        raise ValueError("tool_args 需要 JSON 对象，transport 可选 http 或 sse")
    local = [k for k in ("design_json", "json_path") if req.get(k) is not None]
    if len(local) > 1 or local and (req.get("design_url") or req.get("tool_args")):
        raise ValueError("请选择一种设计输入：design_json、json_path 或 MCP 图层")
    if "design_json" in local:
        data = req["design_json"]
    elif "json_path" in local:
        data = json.loads(Path(req["json_path"]).expanduser().read_text(encoding="utf-8-sig"))
    else:
        endpoint = req.get("mcp_url") or os.getenv("PIXSO_MCP_URL") or DEFAULT_MCP_URL
        req = dict(req, mcp_url=endpoint)
        if not endpoint or urlsplit(endpoint).scheme not in {"http", "https"}:
            raise ValueError("请提供 mcp_url 或配置 PIXSO_MCP_URL，也可传 design_json / json_path")
        transport = req.get("transport") or ("sse" if urlsplit(endpoint).path.rstrip("/").endswith("/sse") else "http")
        data = asyncio.run(fetch_dsl(endpoint, req.get("design_url"), req.get("tool_args", {}), transport))
    raw = encoded(data)
    snapshot = index / "designs" / f"{digest(raw)}.json"
    atomic_write(snapshot, raw)
    return dict(request=req, snapshot=str(snapshot), manifest_paths=[str(p) for _, p in builds], run_key=str(uuid4()))


def read_design_url(state: StudioInput):
    url = state.get("design_url")
    if not isinstance(url, str) or not url.strip():
        raise ValueError("请填写 Pixso 设计图层链接 design_url")
    return read_design({"request": {"design_url": url.strip()}})


def split_regions(state):
    snapshot = state["snapshot"]
    try:
        roots = design_roots(json.loads(Path(snapshot).read_bytes()), state["request"].get("design_url"))
        nodes = visible_nodes(roots)
    except (ValueError, RecursionError) as exc:
        raise ValueError(f"设计树解析失败：{exc}。已保存至 {snapshot}") from exc
    req = state["request"]
    names_in_index = {
        c["name"] for path in state["manifest_paths"]
        for c in json.loads(Path(path).read_bytes())["components"].values()
    }
    regions, notes = partition(nodes, req.get("structure_only", False), names_in_index)
    if req.get("design_url"):
        parsed = urlsplit(req["design_url"])
        for region in regions:
            for observation in region["observations"]:
                if observation["node_id"]:
                    query = parse_qs(parsed.query)
                    query.pop("node-id", None)
                    query["item-id"] = [observation["node_id"]]
                    observation["url"] = parsed._replace(query=urlencode(query, doseq=True)).geturl()
    incomplete = [n["node_id"] or n["path"] for n in nodes if n["facts"].get("incomplete_children")]
    if incomplete:
        notes.append("子节点未完整展开：" + ", ".join(incomplete))
    supplied = req.get("requirements", {})
    ids = [r["region_id"] for r in regions]
    names = [r["name"] for r in regions]
    if not isinstance(supplied, dict) or any(k not in ids and names.count(k) != 1 for k in supplied):
        raise ValueError("需求映射须使用有效 region_id 或唯一的区域名称")
    if not all(valid_texts(v) for v in supplied.values()):
        raise ValueError("人工需求必须为非空字符串组成的数组")
    extra = {r["region_id"]: supplied.get(r["region_id"], supplied.get(r["name"], [])) for r in regions}
    return dict(regions=regions, notes=notes, extra=extra)


def valid_texts(value):
    return isinstance(value, list) and all(isinstance(t, str) and t.strip() for t in value)


def retrieve(state):
    req = state["request"]
    _, uri = input_options(req)
    manifests = [json.loads(Path(p).read_bytes()) for p in state["manifest_paths"]]
    allowed = public_candidates(manifests)
    base, model, secret = model_settings()
    for m in manifests:
        if m["collection"] != collection_for_model(base, model, m["dimension"]):
            raise ValueError(f"{m['library']} 的索引与当前 embedding 配置不一致")
    if "://" not in uri and not Path(uri).exists():
        raise ValueError(f"本机 Milvus 数据库不存在：{uri}")
    embed = OpenAILikeEmbedding(model_name=model, api_base=base.rstrip("/"), api_key=secret)
    client = MilvusClient(uri=uri)
    regions = []
    previous = {}
    limit, mode = req.get("top_k", 3), req.get("mode", "text_image")
    try:
        for collection in {m["collection"] for m in manifests}:
            if not client.has_collection(collection):
                raise ValueError(f"Milvus 中缺少集合 {collection}")
            client.load_collection(collection)
        for region in state["regions"]:
            query = "；".join([region["query"], *state["extra"][region["region_id"]]])
            key = (query, region.get("component_role"), bool(region.get("navigation")))
            if key in previous:
                regions.append(dict(region, retrieval_query=query, candidates=previous[key]))
                continue
            vector = embed.get_query_embedding(query)
            hits = []
            for m in manifests:
                if len(vector) != m["dimension"] or not all(map(math.isfinite, vector)):
                    raise ValueError("查询向量与索引不兼容")
                ids = allowed[m["build_id"]]
                role = region.get("component_role")
                if role or region.get("navigation"):
                    aliases = [cid for cid in ids if (
                        m["components"][cid]["name"].casefold() == role.casefold() if role
                        else is_navigation_name(m["components"][cid]["name"]))]
                    if aliases:
                        hits.extend(candidates(client, m, vector, limit, mode, aliases))
                hits.extend(candidates(client, m, vector, limit, mode, ids))
            ranked = sorted(hits, key=lambda c: (
                c["name"].casefold() == (region.get("component_role") or "").casefold() or
                bool(region.get("navigation") and is_navigation_name(c["name"])),
                c["score"]), reverse=True)
            unique = {}
            for c in ranked:
                unique.setdefault((c["build_id"], c["component_id"]), c)
            previous[key] = list(unique.values())[:limit]
            regions.append(dict(region, retrieval_query=query, candidates=previous[key]))
    finally:
        client.close()
    return {"regions": regions}


def verify_regions(state):
    index, _ = input_options(state["request"])
    manifests = [json.loads(Path(p).read_bytes()) for p in state["manifest_paths"]]
    builds = {m["build_id"]: m for m in manifests}

    # Identical row variants share a model judgment. Each region still resolves its own
    # design paths, source quotes, and screenshots after the response is validated.
    answers = {}
    lock = Lock()

    def judge(instruction, payload):
        key = encoded([instruction, payload])
        with lock:
            if key in answers:
                future, producer = answers[key], False
            else:
                future = answers[key] = Future()
                producer = True
        if producer:
            try:
                future.set_result(ask_json(instruction, payload))
            except BaseException as exc:
                future.set_exception(exc)
                raise
        return future.result()

    def verify(region):
        return confirmed_match(region, state["extra"][region["region_id"]], builds, index, judge=judge)

    with get_executor_for_config({"max_concurrency": 3}) as pool:
        matches = [match for match in pool.map(verify, state["regions"]) if match]
    return {"matches": matches}


def save_report(state):
    req = state["request"]
    index, _ = input_options(req)
    destination = index / "reports" / (state["run_key"] + ".json")
    matches = [dict(m) for m in state["matches"]]
    endpoint = req.get("mcp_url") or os.getenv("PIXSO_MCP_URL")
    notes = list(state.get("notes", []))
    if matches and endpoint and req.get("screenshots", True) and not (
            req.get("json_path") or "design_json" in req):
        transport = req.get("transport") or ("sse" if urlsplit(endpoint).path.rstrip("/").endswith("/sse") else "http")
        try:
            notes.extend(asyncio.run(capture_regions(endpoint, transport, matches, destination.with_suffix(""))))
        except Exception as exc:
            cause = exc
            while isinstance(cause, BaseExceptionGroup):
                cause = cause.exceptions[0]
            notes.append(f"Pixso 区域截图未全部获取：{type(cause).__name__} {cause}")
            progress(notes[-1])
    report = dict(matches=matches, saved_to=str(destination), markdown=str(destination.with_suffix(".md")))
    atomic_write(destination.with_suffix(".md"), markdown_report(report).encode())
    atomic_write(destination, encoded(report))
    return {"report": report, "notes": notes}


def build_graph(*, studio=True):
    graph = StateGraph(MatchState, input_schema=StudioInput if studio else MatchInput, output_schema=MatchOutput)
    steps = [
        ("read_pixso", "读取 Pixso 设计稿", read_design_url if studio else read_design),
        ("partition_regions", "拆分区域与嵌套控件", split_regions),
        ("retrieve_components", "检索候选组件", retrieve),
        ("verify_evidence", "核验组件推荐依据", verify_regions),
        ("save_report", "保存报告与区域截图", save_report),
    ]
    sequence = [(f"{key} · {label}" if studio else key, node) for key, label, node in steps]
    graph.add_sequence(sequence)
    graph.add_edge(START, sequence[0][0])
    graph.add_edge(sequence[-1][0], END)
    return graph.compile(name="Pixso 组件推荐凭证")


graph = build_graph()


def main():
    load_dotenv(PROJECT / ".env")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("design_url", nargs="?")
    parser.add_argument("--mcp-url")
    parser.add_argument("--transport", choices=("http", "sse"))
    parser.add_argument("--tool-args", type=json.loads)
    parser.add_argument("--json", dest="json_path", help="回放本地设计 JSON")
    parser.add_argument("--index")
    parser.add_argument("--library")
    parser.add_argument("--release")
    parser.add_argument("--uri")
    parser.add_argument("--mode", choices=("text_image", "text"), default="text_image")
    parser.add_argument("--top-k", type=int, default=3)
    parser.add_argument("--structure-only", action="store_true")
    parser.add_argument("--no-screenshots", dest="screenshots", action="store_false")
    parser.add_argument("--requirements", type=json.loads, help='区域 ID 到人工需求数组的 JSON 对象')
    parser.add_argument("--report", type=Path, help="另存完整选型报告")
    parser.add_argument("--trace", action="store_true", help="将本次运行发送到 LangSmith")
    args = vars(parser.parse_args())
    target, trace = args.pop("report"), args.pop("trace")
    request = {k: v for k, v in args.items() if v is not None}
    project_name = os.getenv("PIXSO_LANGSMITH_PROJECT", "pixso-component-match")
    run_id = uuid4()
    with tracing_context(enabled=trace, project_name=project_name):
        report = build_graph(studio=False).invoke({"request": request}, {"run_id": run_id})["report"]
    if trace:
        from langchain_core.tracers.langchain import wait_for_all_tracers
        wait_for_all_tracers()
        progress(f"LangSmith 项目 {project_name}，run ID {run_id}")
    output = json.dumps(report, ensure_ascii=False, indent=2)
    if target:
        atomic_write(target, output.encode())
    progress(f"凭证报告已保存：{report['saved_to']}")
    print(output)


if __name__ == "__main__":
    try:
        main()
    except ExceptionGroup as exc:
        cause = exc
        while isinstance(cause, BaseExceptionGroup):
            cause = cause.exceptions[0]
        sys.exit(f"Pixso MCP 调用失败：{cause}")
    except (OSError, ValueError, TimeoutError) as exc:
        sys.exit(str(exc))
