"""Resolve the runtime scene and look up Meiyou URI documentation."""

from __future__ import annotations

import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Literal

import httpx


Scene = Literal["webview", "h5"]
DOCS_URL = "https://apidoc.seeyouyima.com/uri-docs/#/docs/"
API_URL = "https://apidoc.seeyouyima.com/uri-docs-api/"
DOC_ID = re.compile(r"[0-9a-f]{24}", re.IGNORECASE)
PATH_FIELD = re.compile(r"^[ \t]*(?:-[ \t]+)?\**(?:路径|path)\**[ \t]*[:：]\**[ \t]*(.+)$", re.I | re.M)
METHOD_FIELD = re.compile(r"^[ \t]*\**调用方式\**[ \t]*[:：]\**[ \t]*(.+)$", re.M)
SDK_METHOD = re.compile(r"\b(?:callNative|on|off)\b")
PROTOCOL_PATH = re.compile(r"/?[\w.-]+(?:/[\w.-]+)*", re.ASCII)
ALIASES = {
    "打开网页": "web",
    "跳转网页": "web",
    "打开新网页": "web",
    "打开新webview": "web",
    "全屏打开网页": "web/pure",
    "全屏webview": "web/pure",
    "app登录": "登录",
    "唤起登录": "登录",
    "唤起app登录": "登录",
    "login": "登录",
    "分享": "分享功能",
    "app分享": "分享功能",
    "监听网络变化": "网络变化事件",
}
MAX_CANDIDATES = 5
MAX_MARKDOWN = 6_000
CACHE_VERSION = 1


class DocsUnavailable(Exception):
    """The official read-only endpoint could not provide a usable response."""


def _read(client: httpx.Client, endpoint: str, **params):
    try:
        response = client.get(endpoint, params=params)
        response.raise_for_status()
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise DocsUnavailable("无法访问美柚 Uri-Docs，请检查网络或稍后重试。") from exc
    if not isinstance(payload, dict) or payload.get("success") is not True or "data" not in payload:
        raise DocsUnavailable("美柚 Uri-Docs 返回了无效响应。")
    return payload["data"]


def _collection(value) -> list:
    if not isinstance(value, list):
        raise DocsUnavailable("美柚 Uri-Docs 的目录响应格式已变化。")
    return value


def _current(category: dict) -> bool:
    # Uri-Docs labels categories created before 2023 as deprecated.
    meta = category.get("meta")
    created_at = meta.get("createdAt") if isinstance(meta, dict) else None
    return (
        not category.get("isDeleted")
        and isinstance(category.get("name"), str)
        and not category["name"].strip().startswith("[废弃]")
        and isinstance(created_at, str)
        and created_at[:4].isdigit()
        and created_at[:4] >= "2023"
    )


def _reference(doc_id: str, name: str, category: str) -> dict:
    return {"docId": doc_id, "name": name, "category": category, "url": DOCS_URL + doc_id}


def _contract(markdown: str) -> tuple[str | None, list[str]]:
    field = PATH_FIELD.search(markdown)
    path = field[1].strip().strip("`").strip() if field else ""
    if not PROTOCOL_PATH.fullmatch(path) or path.casefold().lstrip("/") in {"path", "your/path", "xxx", "..."}:
        return None, []
    field = METHOD_FIELD.search(markdown)
    methods = list(dict.fromkeys(SDK_METHOD.findall(field[1]))) if field else []
    return path, methods


def _fetch_document(client: httpx.Client, doc_id: str, category_id: str, category_name: str) -> dict | None:
    data = _read(client, "get-uri", docId=doc_id)
    if not isinstance(data, dict) or data.get("_id") != doc_id or not isinstance(data.get("name"), str):
        raise DocsUnavailable(f"美柚 Uri-Docs 未返回目录中的文档 {doc_id}。")
    if data.get("isDeleted"):
        return None
    if data.get("category") != category_id:
        raise DocsUnavailable("美柚 Uri-Docs 的目录在拉取期间发生变化，请稍后重试。")
    markdown = data.get("mdContent") or ""
    if not isinstance(markdown, str):
        raise DocsUnavailable("美柚 Uri-Docs 的详情响应格式已变化。")
    path, methods = _contract(markdown)
    return {
        "docId": doc_id, "name": data["name"], "category": category_name,
        "markdown": markdown, "path": path, "methods": methods,
    }


def protocol_cache_path() -> Path:
    configured = Path(os.environ.get("XDG_CACHE_HOME", ""))
    root = configured if configured.is_absolute() else Path.home() / ".cache"
    return root / "visual-qa-langgraph" / "uri-docs.json"


def _write_cache(path: Path, snapshot: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, prefix=".uri-docs-", delete=False)
    staged = Path(temporary.name)
    try:
        with temporary:
            json.dump(snapshot, temporary, ensure_ascii=False, separators=(",", ":"))
            temporary.write("\n")
        staged.replace(path)
    finally:
        staged.unlink(missing_ok=True)


def _refresh_cache(path: Path) -> dict:
    with httpx.Client(base_url=API_URL, timeout=5.0) as client:
        categories = []
        entries = {}
        for category in _collection(_read(client, "get-categories")):
            if not isinstance(category, dict) or not _current(category):
                continue
            category_id, category_name = category.get("_id"), category["name"]
            if not isinstance(category_id, str):
                raise DocsUnavailable("美柚 Uri-Docs 的目录缺少分类 ID。")
            categories.append(category_name)
            for entry in _collection(category.get("uri")):
                doc_id = entry.get("id") if isinstance(entry, dict) else None
                if not isinstance(doc_id, str) or not DOC_ID.fullmatch(doc_id):
                    raise DocsUnavailable("美柚 Uri-Docs 的目录缺少有效文档 ID。")
                target = (category_id, category_name)
                if doc_id in entries and entries[doc_id] != target:
                    raise DocsUnavailable("美柚 Uri-Docs 的同一文档出现在多个目录。")
                entries[doc_id] = target
        if not entries:
            raise DocsUnavailable("美柚 Uri-Docs 未返回任何现行协议。")

        def fetch(doc_id: str) -> dict | None:
            return _fetch_document(client, doc_id, *entries[doc_id])

        with ThreadPoolExecutor(max_workers=6) as pool:
            documents = [doc for doc in pool.map(fetch, entries) if doc is not None]
    if not documents:
        raise DocsUnavailable("美柚 Uri-Docs 未返回任何现行协议详情。")
    snapshot = {
        "schemaVersion": CACHE_VERSION, "cachedAt": datetime.now(timezone.utc).isoformat(),
        "categories": categories, "documents": documents,
    }
    _write_cache(path, snapshot)
    return snapshot


def _load_cache(path: Path) -> dict:
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    if (not isinstance(snapshot, dict) or snapshot.get("schemaVersion") != CACHE_VERSION
            or not isinstance(snapshot.get("cachedAt"), str)
            or not isinstance(snapshot.get("categories"), list)
            or not isinstance(snapshot.get("documents"), list)
            or not snapshot["documents"]):
        raise ValueError("无效的 WebView 协议缓存")
    if any(not isinstance(name, str) for name in snapshot["categories"]):
        raise ValueError("无效的 WebView 协议分类缓存")
    for doc in snapshot["documents"]:
        if (not isinstance(doc, dict)
                or any(not isinstance(doc.get(key), str) for key in ("docId", "name", "category", "markdown"))
                or not DOC_ID.fullmatch(doc["docId"])
                or (doc.get("path") is not None and not isinstance(doc["path"], str))
                or not isinstance(doc.get("methods"), list)
                or any(not isinstance(method, str) for method in doc["methods"])):
            raise ValueError("无效的 WebView 协议文档缓存")
    return snapshot


def _sync_cache(path: Path) -> tuple[dict | None, str | None]:
    try:
        return _refresh_cache(path), None
    except DocsUnavailable as exc:
        return None, str(exc)
    except OSError:
        return None, f"无法写入 WebView 协议缓存 {path}。"


def refresh_protocol_cache(*, cache_path: Path | None = None) -> dict:
    """Explicitly download and replace the current-protocol cache."""
    path = cache_path if cache_path is not None else protocol_cache_path()
    snapshot, error = _sync_cache(path)
    if snapshot is None:
        return {"status": "unavailable", "error": error}
    return {"status": "ready", "cachedAt": snapshot["cachedAt"], "cachePath": str(path),
            "categoryCount": len(snapshot["categories"]), "protocolCount": len(snapshot["documents"])}


def _document_reference(doc: dict) -> dict:
    return _reference(doc["docId"], doc["name"], doc["category"])


def _detail(doc: dict, include_markdown: bool) -> dict:
    reference = _document_reference(doc)
    if include_markdown:
        markdown = doc["markdown"]
        reference["referenceMarkdown"] = markdown[:MAX_MARKDOWN]
        reference["referenceTruncated"] = len(markdown) > MAX_MARKDOWN
    path, methods = doc.get("path"), doc["methods"]
    if path is None or not methods:
        return {"status": "needs_confirmation", "reason": "incomplete_contract", "document": reference}
    return {"status": "matched", "path": path, "methods": methods, "document": reference}


def _lookup(query: str, entries: list[dict], include_markdown: bool) -> dict:
    reference = query.removeprefix(DOCS_URL).lower()
    if DOC_ID.fullmatch(reference):
        doc = next((entry for entry in entries if entry["docId"].lower() == reference), None)
        return _detail(doc, include_markdown) if doc else {"status": "not_found"}

    term = ALIASES.get("".join(query.casefold().split()), query)
    key = term.casefold()
    exact = [entry for entry in entries if key in (entry["name"].casefold(), (entry.get("path") or "").casefold())]
    if len(exact) == 1:
        return _detail(exact[0], include_markdown)
    if exact:
        return {"status": "needs_confirmation", "reason": "ambiguous",
                "candidates": [_document_reference(doc) for doc in exact[:MAX_CANDIDATES]]}

    category_matches = [entry for entry in entries if entry["category"].casefold() == key]
    candidates = category_matches or [
        entry for entry in entries if any(key in entry[field].casefold() for field in ("name", "markdown"))
    ]
    if candidates:
        return {"status": "needs_confirmation", "reason": "review_candidates",
                "candidates": [_document_reference(doc) for doc in candidates[:MAX_CANDIDATES]]}
    return {"status": "not_found"}


def lookup_protocols(
    queries: list[str] | None = None, *, scene: Scene | None = None, project_scene: Scene | None = None,
    include_markdown: bool = False, cache_path: Path | None = None,
) -> dict:
    """Look up protocols locally, downloading the catalog only on the first cache miss."""
    if any(value not in (None, "webview", "h5") for value in (scene, project_scene)):
        raise ValueError("scene and project_scene must be webview or h5")
    if scene and project_scene and scene != project_scene:
        raise ValueError("scene conflicts with project_scene")
    runtime = scene or project_scene or "webview"
    result = {
        "scene": runtime,
        "sceneSource": "explicit" if scene else "project" if project_scene else "default",
        "h5Fallback": False,
        "status": "ready",
        "results": [],
    }
    if runtime == "h5":
        return result

    terms = [query.strip() for query in queries or []]
    if len(terms) > 8 or any(not term or len(term) > 100 or "\n" in term or "\r" in term for term in terms):
        raise ValueError("Provide at most eight single-line lookup terms, each 1–100 characters")
    if any("://" in term and not DOC_ID.fullmatch(term.removeprefix(DOCS_URL)) for term in terms):
        raise ValueError("Use a canonical Meiyou Uri-Docs link or a short lookup term")
    terms = list(dict.fromkeys(terms))

    path = cache_path if cache_path is not None else protocol_cache_path()
    source = "cache"
    try:
        snapshot = _load_cache(path)
    except FileNotFoundError:
        snapshot, error = _sync_cache(path)
        if snapshot is None:
            return {**result, "status": "unavailable", "error": error}
        source = "network"
    except (OSError, ValueError):
        return {**result, "status": "unavailable", "error": "本地 WebView 协议缓存无法读取，请明确更新缓存。"}
    result.update({"source": source, "cachedAt": snapshot["cachedAt"]})
    documents = snapshot["documents"]
    if not terms:
        counts = dict.fromkeys(snapshot["categories"], 0)
        for doc in documents:
            counts[doc["category"]] = counts.get(doc["category"], 0) + 1
        return {**result, "categories": [{"name": name, "count": count} for name, count in counts.items()]}
    result["results"] = [{"query": term, **_lookup(term, documents, include_markdown)} for term in terms]
    if any(match["status"] != "matched" for match in result["results"]):
        result["status"] = "needs_confirmation"
    return result
