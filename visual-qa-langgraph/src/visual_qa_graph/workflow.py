"""Small graph state, content-addressed preparation, and real visual evidence."""

from __future__ import annotations

import base64
import hashlib
import html
import json
import os
import re
import shutil
import time
from uuid import uuid4
from pathlib import Path
from typing import Any, TypedDict
from urllib.parse import urlparse

os.environ.setdefault("LANGGRAPH_STRICT_MSGPACK", "true")

from langgraph.graph import END, START, StateGraph
from langgraph.checkpoint.sqlite import SqliteSaver

from .pixso import fetch_design, resolve_red_image_nodes
from .comparison import compare_images
from .engine import verify_case
from .intent import create_intent_plan
from .materialize import bind_images
from .diagnostics import capture_failures
from .project_policy import apply_case_policy, read_project_policy
from .repair import (apply_edits, parse_repair_response, recover_pending_edits,
                     rollback_edits, set_transaction_status, source_context)
from .timing import append_timing, close_interrupted_attempts, now_ms, write_timing_summary


class RunState(TypedDict, total=False):
    case_path: str
    run_dir: str
    cache_dir: str
    repo_root: str
    browser_endpoint: str | None
    pixso_endpoint: str | None
    pixso_revision: str | None
    pixso_refresh: bool
    auto_fix: bool
    max_fixes: int
    fix_count: int
    rounds: list[dict[str, Any]]
    edits: list[dict[str, str]]
    apply_result: dict[str, Any] | None
    rollback_requested: bool
    offline_actual: str | None
    model_name: str | None
    source_paths: list[str]
    project_skill: str | None
    project_policy: dict[str, Any] | None
    effective_case_path: str | None
    policy_event: dict[str, Any]
    annotated_image: str | None
    image_map: str | None
    image_html: str | None
    annotated_frame: str | None
    intent_plan_path: str | None
    intent_event: dict[str, Any]
    bind_event: dict[str, Any]
    case: dict[str, Any]
    design: dict[str, Any]
    pixso: dict[str, Any] | None
    source: dict[str, Any]
    fingerprint: str
    verification: dict[str, Any]
    packet: dict[str, Any]
    diagnosis: str | None
    model_usage: dict[str, int]
    load_event: dict[str, Any]
    design_event: dict[str, Any]
    source_event: dict[str, Any]
    join_event: dict[str, Any]
    verify_event: dict[str, Any]
    packet_event: dict[str, Any]
    diagnose_event: dict[str, Any]
    apply_event: dict[str, Any]
    round_event: dict[str, Any]


def _json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _key(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _cached(run_dir: Path, name: str, key: str, create: Any) -> tuple[dict[str, Any], bool]:
    path = run_dir / "entries" / name / f"{key}.json"
    if path.exists():
        try:
            entry = _json(path)
            if entry.get("key") == key and isinstance(entry.get("value"), dict):
                return entry["value"], True
        except (OSError, ValueError, json.JSONDecodeError):
            pass
    value = create()
    _write_json(path, {"key": key, "value": value})
    return value, False


def _event(name: str, started: float, *, cached: bool = False,
           state: RunState | None = None, phase: str | None = None) -> dict[str, Any]:
    duration = round((time.perf_counter() - started) * 1000, 2)
    end_ms = now_ms()
    event = {"node": name, "durationMs": duration, "cached": cached,
             "startMs": round(end_ms - duration, 2), "endMs": round(end_ms, 2)}
    if state and state.get("run_dir"):
        round_index = 0 if name in {"load_case", "project_policy", "prepare_intent"} else len(state.get("rounds") or []) + 1
        append_timing(Path(state["run_dir"]), {"kind": "node", **event,
                                               "status": "ok", "roundIndex": round_index,
                                               **({"phase": phase} if phase else {})})
    return event


def _guard_node(name: str, node: Any):
    def guarded(state: RunState) -> dict[str, Any]:
        started = time.perf_counter()
        start_ms = now_ms()
        try:
            return node(state)
        except Exception:
            if state.get("run_dir"):
                end_ms = now_ms()
                append_timing(Path(state["run_dir"]), {"kind": "node", "node": name,
                    "startMs": round(start_ms, 2), "endMs": round(end_ms, 2),
                    "durationMs": round((time.perf_counter() - started) * 1000, 2),
                    "cached": False, "status": "failed",
                    **({"phase": "parallel"} if name in {"prepare_design", "prepare_source", "join_preparation"} else {}),
                    "roundIndex": 0 if name in {"load_case", "prepare_intent"} else len(state.get("rounds") or []) + 1})
            raise
    return guarded


def _resolve_case_file(case_path: Path, value: str) -> Path:
    return (case_path.parent / value).resolve()


def _local_references(path: Path) -> list[Path]:
    text = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix.lower() in {".html", ".htm"}:
        text = html.unescape(text)
    references = re.findall(r"(?:src|href)\s*=\s*['\"]([^'\"]+)['\"]", text, re.I)
    references += re.findall(r"url\(\s*['\"]?([^)'\"]+)", text, re.I)
    local: list[Path] = []
    for value in references:
        parsed = urlparse(value.strip())
        if parsed.scheme or parsed.netloc or value.startswith(("#", "//", "data:")):
            continue
        if parsed.path:
            local.append((path.parent / parsed.path).resolve())
    return local


def _load_case(state: RunState) -> dict[str, Any]:
    started = time.perf_counter()
    case_path = Path(state["case_path"])
    case = _json(case_path)
    if case.get("platform", "web") != "web":
        raise ValueError("Version 1 currently supports web cases only")
    if not isinstance(case.get("designImage"), str):
        raise ValueError("case.designImage is required")
    policy_started = time.perf_counter()
    policy = read_project_policy(Path(state["project_skill"])) if state.get("project_skill") else None
    policy_event = _event("project_policy", policy_started, cached=not bool(policy), state=state)
    if policy:
        case = apply_case_policy(case, policy)
        run_dir = Path(state["run_dir"])
        _write_json(run_dir / "project-policy.json", policy)
        _write_json(run_dir / "scaffold-options.json", policy["scaffoldOptions"])
    return {"case": case, "project_policy": policy,
            "load_event": _event("load_case", started, state=state),
            "policy_event": policy_event}


def _prepare_intent(state: RunState) -> dict[str, Any]:
    started = time.perf_counter()
    if not state.get("annotated_image"):
        return {"intent_plan_path": None, "intent_event": _event("prepare_intent", started, state=state)}
    case = state["case"]
    case_path = Path(state["case_path"])
    original = _json(_resolve_case_file(case_path, case["intentPlan"])) if case.get("intentPlan") else {}
    design_url = original.get("source", {}).get("designUrl") or case.get("designUrl")
    node_id = original.get("source", {}).get("nodeId") or case.get("pixsoNodeId")
    if not node_id:
        raise ValueError("Red-image intent needs case.pixsoNodeId or an existing intent plan root node")
    viewport = case.get("viewport") or {}
    if not viewport.get("width") or not viewport.get("height"):
        raise ValueError("Red-image intent needs case.viewport width and height")
    output = Path(state["run_dir"]) / "red-image-intent.json"
    plan = create_intent_plan(
        annotated=Path(state["annotated_image"]), node_id=node_id, viewport=viewport,
        design_url=design_url, image_map=Path(state["image_map"]) if state.get("image_map") else None,
        frame=state.get("annotated_frame"),
    )
    _write_json(output, plan)
    return {"intent_plan_path": str(output), "intent_event": _event("prepare_intent", started, state=state)}


def _prepare_design(state: RunState) -> dict[str, Any]:
    started = time.perf_counter()
    case_path = Path(state["case_path"])
    case = state["case"]
    design_path = _resolve_case_file(case_path, case["designImage"])
    if not design_path.is_file():
        raise FileNotFoundError(design_path)
    paths = [design_path]
    plan_path: Path | None = None
    if state.get("intent_plan_path") or case.get("intentPlan"):
        plan_path = Path(state["intent_plan_path"]) if state.get("intent_plan_path") else _resolve_case_file(case_path, case["intentPlan"])
        plan = _json(plan_path)
        if plan.get("status") != "ready":
            raise ValueError(f"Intent plan must be ready: {plan_path}")
        if state.get("intent_plan_path") and state.get("pixso_endpoint"):
            plan = resolve_red_image_nodes(state["pixso_endpoint"], plan)
            resolved = Path(state["run_dir"]) / "red-image-resolved.json"
            _write_json(resolved, plan)
            plan_path = resolved
        paths.append(plan_path)
    asset_dir = case_path.parent / "assets"
    assets = sorted(asset_dir.glob("**/*")) if asset_dir.is_dir() else []
    paths.extend(path for path in assets if path.is_file())
    hashes = {str(path): _sha256(path) for path in paths}
    if plan_path:
        hashes[str(plan_path)] = _key({key: value for key, value in plan.items() if key != "generatedAt"})
    key = _key({"design": hashes[str(design_path)],
                "plan": hashes.get(str(plan_path)) if plan_path else None,
                "assets": sorted(hashes[str(path)] for path in assets if path.is_file())})
    value, reused = _cached(Path(state["cache_dir"]), "design", key, lambda: {
        "designPath": str(design_path),
        "intentPlanPath": str(plan_path) if plan_path else None,
        "assetCount": len(paths) - 1 - int(plan_path is not None),
        "files": hashes,
        "hash": key,
    })
    value = {**value, "designPath": str(design_path),
             "intentPlanPath": str(plan_path) if plan_path else None, "files": hashes}
    pixso = None
    if state.get("pixso_endpoint"):
        if not plan_path:
            raise ValueError("Pixso MCP requires case.intentPlan")

        pixso = fetch_design(
            endpoint=state["pixso_endpoint"], revision=state["pixso_revision"],
            plan_path=plan_path, design_hash=hashes[str(design_path)],
            cache_dir=Path(state["cache_dir"]), scale=3,
            refresh=state.get("pixso_refresh", False),
        )
    return {"design": value, "pixso": pixso,
            "design_event": _event("prepare_design", started,
                                    cached=reused and (pixso is None or pixso["cached"]),
                                    state=state, phase="parallel")}


def _prepare_source(state: RunState, *, phase: str = "parallel") -> dict[str, Any]:
    started = time.perf_counter()
    case_path = Path(state["case_path"])
    source_paths = state.get("source_paths") or [
        str(case_path.parent / name) for name in ("index.html", "styles.css", "main.js")
        if (case_path.parent / name).is_file()
    ]
    paths = [Path(value).resolve() for value in source_paths]
    if not paths:
        raise ValueError("No source files found; pass --source for this project")
    for path in paths:
        if not path.is_file():
            raise FileNotFoundError(path)
    hashes = {str(path): _sha256(path) for path in paths}
    references = sorted({ref for path in paths for ref in _local_references(path)})
    reference_state = {str(ref): _sha256(ref) if ref.is_file() else None for ref in references}
    key = _key({"source": hashes, "references": reference_state})

    def scan() -> dict[str, Any]:
        missing = sorted(str(ref) for ref in references if not ref.exists())
        return {"files": hashes, "hash": key, "missingLocalReferences": missing}

    value, reused = _cached(Path(state["cache_dir"]), "source", key, scan)
    return {"source": value, "source_event": _event("prepare_source", started, cached=reused,
                                                     state=state, phase=phase)}


def _join_preparation(state: RunState, *, phase: str = "parallel") -> dict[str, Any]:
    started = time.perf_counter()
    fingerprint = _key({
        "case": state["case"], "design": state["design"]["hash"],
        "source": state["source"]["hash"],
        "projectPolicy": (state.get("project_policy") or {}).get("sha256"),
        "pixso": state.get("pixso", {}).get("key") if state.get("pixso") else None,
    })
    return {"fingerprint": fingerprint, "join_event": _event("join_preparation", started,
                                                               state=state, phase=phase)}


def _bind_images(state: RunState) -> dict[str, Any]:
    started = time.perf_counter()
    effective_case_path = None
    if state.get("project_policy") or state.get("annotated_image"):
        original_path = Path(state["case_path"])
        output_name = state["case"].get("outputDir") or f"./artifacts/{state['case'].get('name', 'visual-qa-langgraph')}"
        effective = {**state["case"],
                     "designImage": str(_resolve_case_file(original_path, state["case"]["designImage"])),
                     "outputDir": str(_resolve_case_file(original_path, output_name))}
        plan_path = state["design"].get("intentPlanPath")
        if plan_path:
            effective["intentPlan"] = plan_path
        if isinstance(effective.get("changeDetection"), dict) and effective["changeDetection"].get("projectRoot"):
            effective["changeDetection"] = {**effective["changeDetection"],
                "projectRoot": str(_resolve_case_file(original_path, effective["changeDetection"]["projectRoot"]))}
        effective_case_path = str(Path(state["run_dir"]) / "effective-case.json")
        _write_json(Path(effective_case_path), effective)
    if not state.get("annotated_image"):
        return {"effective_case_path": effective_case_path,
                "bind_event": _event("bind_images", started, state=state)}
    plan_path = Path(state["design"]["intentPlanPath"])
    plan = _json(plan_path)
    html_path = Path(state.get("image_html") or (Path(state["case_path"]).parent / "index.html"))
    if not html_path.is_file():
        raise FileNotFoundError(f"Image target HTML missing: {html_path}")
    selected_sources = state.get("source_paths") or []
    if selected_sources and str(html_path.resolve()) not in selected_sources:
        raise ValueError("--image-html must also be included in --source when source files are explicit")
    bound = bind_images(plan, state.get("pixso") or {}, html_path, state.get("project_policy"))
    refreshed = _prepare_source(state, phase="refresh")
    joined = _join_preparation({**state, **refreshed}, phase="refresh")
    return {**refreshed, **joined, "effective_case_path": effective_case_path,
            "bind_event": {**_event("bind_images", started, state=state), **bound}}


def _verify(state: RunState) -> dict[str, Any]:
    started = time.perf_counter()
    case_path = Path(state["case_path"])
    run_dir = Path(state["run_dir"])
    actual = state.get("offline_actual")
    if actual:
        diff_path = run_dir / "evidence" / "offline-diff.png"
        diff_path.parent.mkdir(parents=True, exist_ok=True)
        comparison = compare_images(
            _resolve_case_file(case_path, state["case"]["designImage"]),
            Path(actual).resolve(), diff_path, state["case"].get("thresholds"),
            state["case"].get("criticalRegions"),
        )
        verification = {
            "status": "offline_review", "mode": "offline", "comparison": comparison,
            "artifacts": {"design": str(_resolve_case_file(case_path, state["case"]["designImage"])),
                          "actual": str(Path(actual).resolve()), "diff": str(diff_path)},
            "note": "Offline comparison is diagnostic evidence, not final acceptance",
        }
    else:
        verification = verify_case(
            Path(state.get("effective_case_path") or case_path),
            browser_endpoint=state.get("browser_endpoint"),
        )
        evidence = run_dir / "evidence" / f"round-{len(state.get('rounds') or []) + 1}"
        evidence.mkdir(parents=True, exist_ok=True)
        artifacts = verification.get("artifacts") or {}
        for name in ("actual", "diff"):
            source = Path(artifacts.get(name, ""))
            if source.is_file():
                destination = evidence / f"{name}{source.suffix}"
                shutil.copy2(source, destination)
                artifacts[name] = str(destination)
        crops = []
        for index, value in enumerate(artifacts.get("diagnosticCrops") or []):
            source = Path(value)
            if source.is_file():
                destination = evidence / f"crop-{index}{source.suffix}"
                shutil.copy2(source, destination)
                crops.append(str(destination))
        if crops:
            artifacts["diagnosticCrops"] = crops
        verification["artifacts"] = artifacts
        archived_report = evidence / "report.json"
        verification["reportPath"] = str(archived_report)
        artifacts["report"] = str(archived_report)
        capture = verification.get("capture") or {}
        if artifacts.get("actual"):
            capture["outputPath"] = artifacts["actual"]
        comparison = verification.get("comparison") or {}
        for key, name in (("actualPath", "actual"), ("diffPath", "diff")):
            if artifacts.get(name):
                comparison[key] = artifacts[name]
        _write_json(archived_report, verification)
    return {"verification": verification, "verify_event": _event("verify", started, state=state)}


def make_repair_packet(verification: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
    comparison = verification.get("comparison") or {}
    regions = sorted(
        comparison.get("differenceRegions") or [],
        key=lambda region: region.get("mismatchPixels", 0), reverse=True,
    )[:4]
    compact_regions = []
    for region in regions:
        candidates = []
        for item in (region.get("domCandidates") or [])[:2]:
            styles = item.get("styles") or {}
            candidates.append({
                "selector": item.get("selector"), "bounds": item.get("bounds"),
                "styles": {key: styles.get(key) for key in (
                    "position", "width", "height", "font-family", "font-size",
                    "line-height", "transform", "overflow",
                ) if key in styles},
            })
        compact_regions.append({
            "box": {key: region.get(key) for key in ("x", "y", "width", "height")},
            "mismatchPixels": region.get("mismatchPixels"),
            "mismatchPercent": region.get("mismatchPercent"),
            "domCandidates": candidates,
        })
    return {
        "status": verification.get("status"), "mode": verification.get("mode"),
        "mismatchPercent": comparison.get("mismatchPercent"), "ssim": comparison.get("ssim"),
        "regions": compact_regions,
        "missingLocalReferences": source.get("missingLocalReferences", [])[:12],
        **capture_failures(verification.get("capture") or {}),
        "diagnosticCrops": (verification.get("artifacts") or {}).get("diagnosticCrops", [])[:4],
        "reportPath": verification.get("reportPath"),
        "rule": "Only a fresh passing final-mode report counts as complete",
    }


def _make_packet(state: RunState) -> dict[str, Any]:
    started = time.perf_counter()
    packet = make_repair_packet(state["verification"], state["source"])
    _write_json(Path(state["run_dir"]) / "repair-packet.json", packet)
    return {"packet": packet, "packet_event": _event("make_packet", started, state=state)}


def _record_round(state: RunState) -> dict[str, Any]:
    started = time.perf_counter()
    verification = state["verification"]
    comparison = verification.get("comparison") or {}
    record = {
        "index": len(state.get("rounds") or []) + 1,
        "status": verification.get("status"), "mode": verification.get("mode"),
        "mismatchPercent": comparison.get("mismatchPercent"), "ssim": comparison.get("ssim"),
        "sourceHash": state["source"]["hash"], "reportPath": verification.get("reportPath"),
    }
    rounds = [*(state.get("rounds") or []), record]
    previous = (state.get("rounds") or [])[-1] if state.get("rounds") else None
    old_mismatch = previous.get("mismatchPercent") if previous else None
    new_mismatch = record.get("mismatchPercent")
    rollback_requested = bool(
        (state.get("apply_result") or {}).get("status") == "applied"
        and record["status"] != "passed"
        and isinstance(old_mismatch, (int, float))
        and isinstance(new_mismatch, (int, float))
        and new_mismatch > old_mismatch + 0.15
    )
    _write_json(Path(state["run_dir"]) / "rounds.json", {"rounds": rounds})
    if (state.get("apply_result") or {}).get("status") == "applied" and not rollback_requested:
        set_transaction_status(state["apply_result"], "verified")
    return {"rounds": rounds, "rollback_requested": rollback_requested,
            "round_event": _event("record_round", started, state=state)}


def _should_diagnose(state: RunState) -> str:
    if state.get("rollback_requested"):
        return "rollback"
    verification = state["verification"]
    if verification.get("status") == "passed" and verification.get("mode") == "final":
        return "done"
    if state.get("auto_fix") and state.get("fix_count", 0) >= state.get("max_fixes", 2):
        return "done"
    return "diagnose" if state.get("model_name") else "done"


def _diagnose(state: RunState) -> dict[str, Any]:
    started = time.perf_counter()
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_openai import ChatOpenAI

    packet = state["packet"]
    auto_fix = state.get("auto_fix", False)
    allowed = [Path(value) for value in state["source"]["files"]] if auto_fix else []
    payload = {"repairPacket": packet}
    if state.get("project_policy"):
        payload["projectPolicy"] = {key: state["project_policy"][key] for key in ("css", "layout")}
    if state.get("case", {}).get("cssRules"):
        payload["cssRules"] = state["case"]["cssRules"]
    if auto_fix:
        payload["sourceExcerpts"] = source_context(packet, allowed)
        payload["allowedPaths"] = [str(path) for path in allowed]
    human_content: list[dict[str, Any]] = [{
        "type": "text", "text": json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
    }]
    if auto_fix:
        for value in packet.get("diagnosticCrops", [])[:2]:
            crop = Path(value)
            if crop.is_file() and crop.stat().st_size <= 1_000_000:
                data = crop.read_bytes()
                if data.startswith(b"\x89PNG\r\n\x1a\n"):
                    human_content.append({"type": "image_url", "image_url": {
                        "url": "data:image/png;base64," + base64.b64encode(data).decode(), "detail": "low",
                    }})
    system = (
        "You repair a web page to match its reference. Use the bounded diagnostic packet and images. "
        "DOM candidates are hypotheses. Return ONLY JSON: "
        '{"diagnosis":"short Chinese explanation","edits":[{"path":"exact allowed absolute path",'
        '"find":"exact unique old text","replace":"new text"}]}. '
        "At most four edits. If uncertain, return an empty edits array. "
        "Fix blocking failures even when pixel differences are zero. Follow projectPolicy and cssRules. "
        "For rem authoring use rootFontSizePx; for build conversion keep authored CSS in px, "
        "but use rem for inline image sizes. Never change the root font size. "
        "Source excerpt line numbers are metadata; exclude them from find/replace text. "
        "Never change design inputs, thresholds, tests, or unrelated code."
        if auto_fix else
        "Diagnose visual differences in Chinese. Suggest specific checks and likely CSS/asset fixes. "
        "Treat DOM candidates as hypotheses. Never claim final acceptance or relax thresholds."
    )
    # The model receives only the bounded packet, selected source snippets and at most two crops.
    response = ChatOpenAI(model=state["model_name"], temperature=0).invoke([
        SystemMessage(content=system), HumanMessage(content=human_content),
    ])
    usage = response.usage_metadata or {}
    input_details = usage.get("input_token_details") or {}
    output_details = usage.get("output_token_details") or {}
    provider_usage = (response.response_metadata or {}).get("token_usage") or {}
    provider_prompt_details = provider_usage.get("prompt_tokens_details") or {}
    call_usage = {
        "modelCalls": 1,
        "inputTokens": int(usage.get("input_tokens", 0)),
        "cachedInputTokens": int(input_details.get("cache_read") or provider_prompt_details.get("cached_tokens") or 0),
        "outputTokens": int(usage.get("output_tokens", 0)),
        "reasoningOutputTokens": int(output_details.get("reasoning", 0)),
        "totalTokens": int(usage.get("total_tokens", 0)),
    }
    previous_usage = state.get("model_usage") or {}
    model_usage = {key: previous_usage.get(key, 0) + value for key, value in call_usage.items()}
    response_text = str(response.content)
    edits: list[dict[str, str]] = []
    if auto_fix:
        try:
            diagnosis, edits = parse_repair_response(response_text, allowed)
        except (ValueError, json.JSONDecodeError) as exc:
            diagnosis = f"Model response could not be applied: {exc}"
    else:
        diagnosis = response_text
    (Path(state["run_dir"]) / "diagnosis.md").write_text(diagnosis + "\n", encoding="utf-8")
    (Path(state["run_dir"]) / f"diagnosis-round-{len(state.get('rounds') or [])}.md").write_text(
        diagnosis + "\n", encoding="utf-8")
    return {"diagnosis": diagnosis, "edits": edits, "model_usage": model_usage,
            "diagnose_event": _event("diagnose", started, state=state)}


def _after_diagnosis(state: RunState) -> str:
    return "apply" if state.get("auto_fix") and state.get("edits") else "done"


def _apply(state: RunState) -> dict[str, Any]:
    started = time.perf_counter()
    attempt = state.get("fix_count", 0) + 1
    allowed = [Path(value) for value in state["source"]["files"]]
    try:
        result = apply_edits(state["edits"], allowed, Path(state["run_dir"]) / "backups" / f"fix-{attempt}",
                             expected_hashes=state["source"]["files"])
    except (OSError, ValueError) as exc:
        result = {"status": "rejected", "reason": str(exc), "files": []}
    _write_json(Path(state["run_dir"]) / f"apply-{attempt}.json", result)
    return {"apply_result": result, "fix_count": attempt,
            "apply_event": _event("apply", started, state=state)}


def _after_apply(state: RunState) -> str:
    return "reverify" if (state.get("apply_result") or {}).get("status") == "applied" else "done"


def _rollback(state: RunState) -> dict[str, Any]:
    started = time.perf_counter()
    rollback_edits(state["apply_result"])
    return {"apply_result": {"status": "rolled_back", "files": []},
            "rollback_requested": False, "apply_event": _event("rollback", started, state=state)}


def build_graph(checkpointer: Any = None):
    preparation = StateGraph(RunState)
    preparation.add_node("prepare_design", _guard_node("prepare_design", _prepare_design))
    preparation.add_node("prepare_source", _guard_node("prepare_source", _prepare_source))
    preparation.add_node("join", _guard_node("join_preparation", _join_preparation))
    preparation.add_edge(START, "prepare_design")
    preparation.add_edge(START, "prepare_source")
    preparation.add_edge(["prepare_design", "prepare_source"], "join")
    preparation.add_edge("join", END)

    qa = StateGraph(RunState)
    qa.add_node("verify", _guard_node("verify", _verify))
    qa.add_node("make_packet", _guard_node("make_packet", _make_packet))
    qa.add_edge(START, "verify")
    qa.add_edge("verify", "make_packet")
    qa.add_edge("make_packet", END)

    graph = StateGraph(RunState)
    graph.add_node("load_case", _guard_node("load_case", _load_case))
    graph.add_node("prepare_intent", _guard_node("prepare_intent", _prepare_intent))
    graph.add_node("preparation", preparation.compile())
    graph.add_node("bind_images", _guard_node("bind_images", _bind_images))
    graph.add_node("qa", qa.compile())
    graph.add_node("record_round", _guard_node("record_round", _record_round))
    graph.add_node("diagnose", _guard_node("diagnose", _diagnose))
    graph.add_node("apply", _guard_node("apply", _apply))
    graph.add_node("rollback", _guard_node("rollback", _rollback))
    graph.add_edge(START, "load_case")
    graph.add_edge("load_case", "prepare_intent")
    graph.add_edge("prepare_intent", "preparation")
    graph.add_edge("preparation", "bind_images")
    graph.add_edge("bind_images", "qa")
    graph.add_edge("qa", "record_round")
    graph.add_conditional_edges("record_round", _should_diagnose,
                                {"rollback": "rollback", "diagnose": "diagnose", "done": END})
    graph.add_conditional_edges("diagnose", _after_diagnosis, {"apply": "apply", "done": END})
    graph.add_conditional_edges("apply", _after_apply, {"reverify": "preparation", "done": END})
    graph.add_edge("rollback", "preparation")
    return graph.compile(checkpointer=checkpointer)


def run_workflow(*, case_path: Path, run_dir: Path, repo_root: Path,
                 offline_actual: Path | None = None, browser_endpoint: str | None = None,
                 model_name: str | None = None, cache_dir: Path | None = None,
                 pixso_endpoint: str | None = None, pixso_revision: str | None = None,
                 pixso_refresh: bool = False, auto_fix: bool | None = None,
                 max_fixes: int | None = None, resume: bool = False,
                 source_paths: list[Path] | None = None,
                 annotated_image: Path | None = None, image_map: Path | None = None,
                 image_html: Path | None = None, annotated_frame: str | None = None,
                 project_skill: Path | None = None) -> dict[str, Any]:
    if auto_fix and (offline_actual or (not model_name and not resume)):
        raise ValueError("Auto-fix requires a model and live browser verification")
    if pixso_endpoint and not pixso_revision and not resume:
        raise ValueError("Pixso MCP requires an explicit revision")
    if max_fixes is not None and not 1 <= max_fixes <= 5:
        raise ValueError("max_fixes must be 1–5")
    run_dir = run_dir.resolve()
    cache_override = cache_dir is not None
    cache_dir = (cache_dir or Path(__file__).resolve().parents[2] / "cache").resolve()
    run_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    started_at_ms = now_ms()
    initial: RunState = {
        "case_path": str(case_path.resolve()), "run_dir": str(run_dir.resolve()),
        "cache_dir": str(cache_dir),
        "repo_root": str(repo_root.resolve()),
        "offline_actual": str(offline_actual.resolve()) if offline_actual else None,
        "browser_endpoint": browser_endpoint,
        "pixso_endpoint": pixso_endpoint, "pixso_revision": pixso_revision,
        "pixso_refresh": pixso_refresh,
        "auto_fix": bool(auto_fix), "max_fixes": max_fixes if max_fixes is not None else 2, "fix_count": 0,
        "rounds": [], "edits": [], "rollback_requested": False,
        "model_name": model_name,
        "source_paths": [str(path.resolve()) for path in (source_paths or [])],
        "project_skill": str(project_skill.resolve()) if project_skill else None,
        "annotated_image": str(annotated_image.resolve()) if annotated_image else None,
        "image_map": str(image_map.resolve()) if image_map else None,
        "image_html": str(image_html.resolve()) if image_html else None,
        "annotated_frame": annotated_frame,
    }
    thread_id_path = run_dir / "thread-id.txt"
    if resume:
        if not thread_id_path.is_file():
            raise FileNotFoundError(f"No checkpoint thread found in {run_dir}")
        thread_id = thread_id_path.read_text(encoding="utf-8").strip()
    else:
        # An explicit new run must not archive the only recovery record of an
        # unfinished write, or replace the old checkpoint identity before recovery.
        recover_pending_edits(run_dir)
        thread_id = str(uuid4())
        thread_id_path.write_text(thread_id + "\n", encoding="utf-8")
    checkpoint_path = run_dir / "checkpoints.sqlite"
    config = {"configurable": {"thread_id": thread_id}}
    with SqliteSaver.from_conn_string(str(checkpoint_path)) as saver:
        graph = build_graph(checkpointer=saver)
        if resume:
            snapshot = graph.get_state(config)
            if not snapshot.values:
                raise RuntimeError("Checkpoint has no saved state to resume")
            saved = dict(snapshot.values)
            if saved["case_path"] != initial["case_path"]:
                raise ValueError("--resume requires the original case path; use a new run directory for a different case")
            for key in ("browser_endpoint", "pixso_endpoint", "pixso_revision", "model_name",
                        "offline_actual", "project_skill", "annotated_image", "image_map",
                        "image_html", "annotated_frame"):
                if initial[key] is not None:
                    saved[key] = initial[key]
            if source_paths is not None:
                saved["source_paths"] = initial["source_paths"]
            if cache_override:
                saved["cache_dir"] = str(cache_dir)
            if auto_fix is not None:
                saved["auto_fix"] = auto_fix
            if max_fixes is not None:
                saved["max_fixes"] = max_fixes
            saved.update(repo_root=initial["repo_root"], pixso_refresh=pixso_refresh)
            if saved.get("auto_fix") and (not saved.get("model_name") or saved.get("offline_actual")):
                raise ValueError("Auto-fix requires a model and live browser verification")
            if saved.get("pixso_endpoint") and not saved.get("pixso_revision"):
                raise ValueError("Pixso MCP requires an explicit revision")
            cache_dir = Path(saved["cache_dir"])
        if resume:
            close_interrupted_attempts(run_dir)
        else:
            previous = [run_dir / name for name in ("timing.jsonl", "timing-summary.json", "summary.json", "backups")]
            if any(path.exists() for path in previous):
                archived = run_dir / "history" / str(uuid4())
                archived.mkdir(parents=True, exist_ok=True)
                for path in previous:
                    if path.exists():
                        path.replace(archived / path.name)
        attempt_id = str(uuid4())
        append_timing(run_dir, {"kind": "run-start", "attemptId": attempt_id,
                                "atMs": started_at_ms, "resume": resume})
        try:
            if resume:
                recovered = recover_pending_edits(run_dir)
                # Every resume revalidates current inputs and takes a fresh screenshot.
                # Restarting at START also discards pending subgraph tasks and stale edits.
                saved.update(edits=[], apply_result=None, rollback_requested=False,
                             diagnosis=None, verification={}, packet={}, source={}, design={},
                             intent_plan_path=None, effective_case_path=None, fingerprint="")
                # A crash may precede the checkpoint which incremented the attempt count.
                attempts = [int(path.name[4:]) for path in (run_dir / "backups").glob("fix-*")
                            if path.is_dir() and path.name[4:].isdigit()]
                saved["fix_count"] = max([saved.get("fix_count", 0), *attempts])
                graph.update_state(config, saved, as_node=START)
                _write_json(run_dir / "resume.json", {"recovered": recovered,
                            "revalidateInputs": True, "browserEndpoint": saved.get("browser_endpoint")})
            result = graph.invoke(None if resume else initial, config)
        except BaseException as exc:
            recovery_error = None
            recovered = []
            try:
                recovered = recover_pending_edits(run_dir)
            except Exception as cleanup_exc:
                recovery_error = str(cleanup_exc)
            append_timing(run_dir, {"kind": "run-end", "attemptId": attempt_id,
                                    "atMs": now_ms(), "status": "failed"})
            timings = write_timing_summary(run_dir)
            failed_state = graph.get_state(config).values
            _write_json(run_dir / "summary.json", {"status": "error", "complete": False,
                        "error": {"type": type(exc).__name__, "message": str(exc)},
                        "recovery": recovered, "recoveryError": recovery_error,
                        "rounds": failed_state.get("rounds", []),
                        "modelUsage": failed_state.get("model_usage", {}), "timings": timings,
                        "checkpointPath": str(checkpoint_path), "threadId": thread_id})
            if recovery_error:
                raise RuntimeError(f"{exc}; rollback could not finish: {recovery_error}") from exc
            raise
    verification = result["verification"]
    summary = {
        "status": verification.get("status"), "mode": verification.get("mode"),
        "complete": verification.get("status") == "passed" and verification.get("mode") == "final",
        "fingerprint": result["fingerprint"],
        "cacheDir": str(cache_dir), "checkpointPath": str(checkpoint_path),
        "threadId": thread_id, "pixso": result.get("pixso"),
        "projectPolicy": result.get("project_policy"),
        "effectiveCasePath": result.get("effective_case_path"),
        "rounds": result.get("rounds", []), "fixCount": result.get("fix_count", 0),
        "lastApply": result.get("apply_result"),
        "mismatchPercent": (verification.get("comparison") or {}).get("mismatchPercent"),
        "ssim": (verification.get("comparison") or {}).get("ssim"),
        "modelUsage": result.get("model_usage", {
            "modelCalls": 0, "inputTokens": 0, "cachedInputTokens": 0,
            "outputTokens": 0, "reasoningOutputTokens": 0, "totalTokens": 0,
        }),
        "totalMs": round((time.perf_counter() - started) * 1000, 2),
        "events": [result[key] for key in (
            "load_event", "policy_event", "intent_event", "design_event", "source_event", "join_event", "bind_event",
            "verify_event", "packet_event", "round_event", "diagnose_event", "apply_event",
        ) if key in result],
        "reportPath": verification.get("reportPath"),
        "repairPacketPath": str(run_dir / "repair-packet.json"),
        "diagnosisPath": str(run_dir / "diagnosis.md") if result.get("diagnosis") else None,
    }
    append_timing(run_dir, {"kind": "run-end", "attemptId": attempt_id,
                            "atMs": now_ms(), "status": "completed"})
    summary["timings"] = write_timing_summary(run_dir)
    summary["timingPath"] = str(run_dir / "timing-summary.json")
    summary["totalMs"] = round((time.perf_counter() - started) * 1000, 2)
    _write_json(run_dir / "summary.json", summary)
    return summary
