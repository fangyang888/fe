"""Discover public exports, component documentation and local example images."""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote, urlsplit

DOC = {".md", ".mdx"}
IMAGE = {".png", ".jpg", ".jpeg", ".webp"}
IGNORE = {"node_modules", ".git", ".venv", "__pycache__", "coverage"}
LOCAL_IMAGE = re.compile(r'!\[([^\]]*)\]\((?:<([^>]+)>|([^\s)]+))(?:\s+["\'][^)]*["\'])?\)')
HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*$")
DEMO_TAG = re.compile(r"""<code\b[^>]*?\ssrc\s*=\s*(["'])(.*?)\1[^>]*>""", re.I | re.S)
DEMO_SUFFIXES = (".tsx", ".jsx", ".ts", ".js")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def key(name):
    return re.sub(r"[\W_]+", "", name).casefold()


def files(root, suffixes, excluded):
    for parent, dirs, names in os.walk(root):
        here = Path(parent)
        dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d not in IGNORE
                         and (here / d).resolve() != excluded and not (here / d).is_symlink())
        for name in sorted(names):
            path = here / name
            if path.suffix.lower() in suffixes and not path.is_symlink():
                yield path


def package_entries(root, meta, skipped):
    def targets(value):
        if isinstance(value, str):
            yield value
        elif isinstance(value, list):
            for item in value:
                yield from targets(item)
        elif isinstance(value, dict):
            for k in dict.fromkeys(["types", "source", "import", "default", *value]):
                if k in value:
                    yield from targets(value[k])

    exports = meta.get("exports", {})
    table = exports if isinstance(exports, dict) and any(k.startswith(".") for k in exports) else {".": exports}
    table = {**table, ".": [meta.get("types"), meta.get("typings"), table.get("."),
                             *[meta.get(k) for k in ("source", "module", "main")],
                             "src/index.ts", "src/index.tsx", "index.d.ts", "index.ts", "index.js"]}
    entries = []
    for module, target in table.items():
        if "*" in module:
            skipped.append(f"{module}：通配符导出需提供具体组件文档或显式入口")
            continue
        for item in targets(target):
            p = (root / item).resolve()
            if p.is_relative_to(root) and p.is_file() and p.suffix in {".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"}:
                hint = p.name.split(".")[0] if p.name.split(".")[0] != "index" else p.parent.name
                entries.append(dict(module=module, path=str(p), hint=hint))
                break
    return entries


def exports(root, entries):
    if not entries:
        return []
    tsc = shutil.which("tsc")
    compiler = Path(tsc).resolve().parents[1] if tsc else root / "node_modules/typescript"
    if not compiler.is_dir() or not shutil.which("node"):
        raise ValueError("解析 JS/TS 包需要 Node.js 和 TypeScript（项目 node_modules/typescript 或 PATH 上的 tsc）")
    proc = subprocess.run(["node", str(Path(__file__).with_name("read_exports.cjs")), str(compiler)],
                          input=json.dumps(dict(root=str(root), entries=entries)), text=True,
                          capture_output=True, check=True)
    return json.loads(proc.stdout)


def sections(lines):
    first, title, fence = 0, "", ""
    for i, line in enumerate(lines):
        code = re.match(r"^\s*(`{3,}|~{3,})", line)
        if code:
            marker = code[1]
            if not fence:
                fence = marker
            elif marker.startswith(fence):
                fence = ""
        h = HEADING.match(line) if not fence else None
        if h:
            if i > first:
                yield first, i, title
            first, title = i, h[1]
    if first < len(lines):
        yield first, len(lines), title


def demo_references(lines):
    """Read active document tags while preserving their source line offsets."""
    fence = ""
    visible = []
    for line in lines:
        marker = re.match(r"^\s*(`{3,}|~{3,})", line)
        if marker:
            if not fence:
                fence = marker[1]
            elif marker[1].startswith(fence):
                fence = ""
            visible.append("")
        else:
            visible.append("" if fence else line)
    body = "\n".join(visible)
    for match in DEMO_TAG.finditer(body):
        yield match[2], body.count("\n", 0, match.start())


def resolve_demo(document, ref, roots, output):
    url = urlsplit(ref)
    rel = Path(unquote(url.path))
    if url.scheme or url.netloc or rel.is_absolute() or not url.path:
        return None
    base = document.parent / rel
    candidates = [base] if base.suffix in DEMO_SUFFIXES else []
    for suffix in DEMO_SUFFIXES:
        candidates.extend([Path(str(base) + suffix), base / ("index" + suffix)])
    for candidate in candidates:
        p = candidate.resolve()
        if p.is_relative_to(output):
            continue
        if any(p.is_relative_to(r) and not IGNORE.intersection(p.relative_to(r).parts) for r in roots) and p.is_file():
            return p
    return None


def discover(root: Path, docs: Path | None, images: Path | None, output: Path):
    meta_path = root / "package.json"
    meta = json.loads(meta_path.read_text()) if meta_path.is_file() else {}
    library = meta.get("name") or root.name
    components, sources, skips = {}, {}, []
    allowed = [p for p in (root, docs, images) if p]
    by_name = defaultdict(set)

    def snapshot(path):
        path = path.resolve()
        if str(path) not in sources:
            data = path.read_bytes()
            sources[str(path)] = {"hash": digest(data), "data": data}
        return sources[str(path)]

    def register(name, module=".", exported=None):
        import_path = library if module == "." else f"{library}/{module.removeprefix('./')}"
        identity = f"{import_path}#{exported or name}"
        by_name[key(name)].add(identity)
        return components.setdefault(identity, dict(name=name, import_path=import_path, evidence=[], figures=[]))

    def evidence(c, path, lines, start, end, kind, title=""):
        # Bound embedding inputs by line groups; keep exact source lines in the snapshot.
        pos = start
        while pos < end:
            stop = pos + 1
            length = len(lines[pos])
            while stop < end and length + len(lines[stop]) + 1 <= 2400:
                length += len(lines[stop]) + 1
                stop += 1
            raw = "\n".join(lines[pos:stop]).strip()
            if raw:
                # Handle generated one-line declarations too.
                for offset in range(0, len(raw), 2400):
                    c["evidence"].append(dict(path=str(path), start=pos+1, end=stop, kind=kind,
                                              title=title, text=raw[offset:offset+2400]))
            pos = stop

    entries = package_entries(root, meta, skips)
    if not entries:
        # A component directory may be documented even when package build outputs are absent.
        for p in files(root, {".tsx", ".jsx"}, output):
            if any(s in p.name.split(".") for s in ("test", "spec", "stories")):
                continue
            hint = p.parent.name if p.stem == "index" else p.stem
            documented_index = p.stem == "index" and any(
                f.stem.casefold() == "readme" and f.suffix.lower() in DOC for f in p.parent.iterdir())
            if documented_index:
                hint = "".join(word[:1].upper() + word[1:] for word in re.split("[-_]", hint))
            if documented_index or (not meta and hint[:1].isupper()):
                entries.append(dict(path=str(p), module="./" + p.relative_to(root).with_suffix("").as_posix(),
                                    hint=hint))
    records = exports(root, entries)
    for rec in records:
        c = register(rec["name"], rec["module"], rec["exportName"])
        for span in rec["spans"]:
            p = Path(span["file"])
            lines = snapshot(p)["data"].decode("utf-8-sig").splitlines()
            evidence(c, p, lines, span["start"]-1, min(len(lines), span["end"]), span["kind"])
    if entries and not records:
        skips.append("公开入口未识别到 PascalCase JS/TS 组件导出")
    doc_root = docs or root
    documents = set(files(doc_root, DOC, output))
    if docs and docs != root:
        documents.update(p for p in files(root, DOC, output)
                         if p.stem.casefold() == "readme" and p.parent != root)
    document_images = set()
    for p in sorted(documents):
        lines = p.read_text(encoding="utf-8-sig").splitlines()
        title = next((m[1] for line in lines if (m := re.match(r"^#\s+(.+)", line))), "")
        stem = p.parent.name if p.stem.lower() in {"readme", "index"} else p.stem
        labels = [stem, title, *re.findall(r"\b[A-Z][A-Za-z0-9]*\b", title)]
        matches = by_name.get(key(stem), set()) if p.stem.lower() == "readme" else set()
        if not matches:
            matches = set().union(*(by_name[key(s)] for s in labels))
        if len(matches) == 1:
            c = components[next(iter(matches))]
        elif matches or (records and meta):
            skips.append(f"{p}：文档未能唯一对应公开导出")
            continue
        elif p.parent == doc_root and p.stem.lower() in {"readme", "index"} and not title:
            skips.append(f"{p}：缺少组件标题")
            continue
        else:
            c = register(title.split()[0] if title else stem)
        snap = snapshot(p)
        # Parse the same immutable bytes that the evidence will reference.
        lines = snap["data"].decode("utf-8-sig").splitlines()
        for a, b, heading in sections(lines):
            body = "\n".join(lines[a:b])
            demos = list(demo_references(lines[a:b]))
            kind = ("api" if re.search(r"props|api|属性|参数|事件", heading, re.I) else
                    "constraint" if re.search(r"限制|注意|deprecated", heading, re.I) else
                    "example" if demos or re.search(r"示例|用例|example|demo", heading, re.I) or "```" in body else "overview")
            evidence(c, p, lines, a, b, kind, heading)
            for ref, offset in demos:
                demo = resolve_demo(p, ref, (root, doc_root), output)
                if demo is None:
                    skips.append(f"{p}:{a+offset+1}：无法读取本地示例 {ref}")
                    continue
                demo_lines = snapshot(demo)["data"].decode("utf-8-sig").splitlines()
                before = len(c["evidence"])
                evidence(c, demo, demo_lines, 0, len(demo_lines), "example", heading)
                for chunk in c["evidence"][before:]:
                    chunk["referenced_by"] = {"path": str(p), "line": a+offset+1}
            for m in LOCAL_IMAGE.finditer(body):
                ref = urlsplit(m[2] or m[3])
                if ref.scheme or ref.netloc:
                    skips.append(f"{p}：跳过远程图例 {ref.path}")
                    continue
                rel = unquote(ref.path)
                choices = [(p.parent / rel).resolve()]
                if images:
                    choices.append((images / rel.lstrip("/")).resolve())
                pic = next((x for x in choices if any(x.is_relative_to(r) for r in allowed)
                            and x.suffix.lower() in IMAGE and x.is_file()), None)
                if not pic:
                    skips.append(f"{p}：图例无法读取 {rel}")
                    continue
                snapshot(pic)
                document_images.add(pic)
                c["figures"].append(dict(path=str(pic), caption=m[1].strip(), title=heading,
                                         source=str(p), line=a+1+body.count("\n", 0, m.start())))
    for pic in files(images or root, IMAGE, output):
        if pic in document_images:
            continue
        matches = by_name.get(key(pic.stem)) or by_name.get(key(pic.parent.name))
        if matches and len(matches) == 1:
            snapshot(pic)
            components[next(iter(matches))]["figures"].append(dict(path=str(pic), caption="", title=pic.stem))
        else:
            skips.append(f"{pic}：无法唯一关联组件")
    components = {k: c for k, c in components.items() if c["evidence"]}
    if not components:
        raise ValueError("未发现可入库组件。请指定单个包根目录或带组件页的 Markdown/MDX 目录。")
    return dict(library=library, release=meta.get("version"), components=components, sources=sources, skipped=skips)
