"""Durable timing records for parallel LangGraph nodes and resumed runs."""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any


_LOCK = threading.Lock()


def now_ms() -> float:
    return time.time_ns() / 1_000_000


def append_timing(run_dir: Path, record: dict[str, Any]) -> None:
    path = run_dir / "timing.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        if path.is_file() and path.stat().st_size:
            with path.open("rb+") as stream:
                stream.seek(-1, 2)
                if stream.read(1) != b"\n":
                    source = path.read_bytes()
                    stream.truncate(source.rfind(b"\n") + 1)
        with path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
            stream.flush()


def read_timing(run_dir: Path) -> list[dict[str, Any]]:
    path = run_dir / "timing.jsonl"
    if not path.is_file():
        return []
    with _LOCK:
        source = path.read_text(encoding="utf-8")
    records: list[dict[str, Any]] = []
    lines = source.splitlines()
    for index, line in enumerate(lines):
        if not line.strip():
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            if index == len(lines) - 1 and not source.endswith("\n"):
                break  # The process stopped during its final append.
            raise
    return records


def close_interrupted_attempts(run_dir: Path) -> None:
    records = read_timing(run_dir)
    starts = {record["attemptId"]: record["atMs"] for record in records if record.get("kind") == "run-start"}
    ended = {record["attemptId"] for record in records if record.get("kind") == "run-end"}
    for attempt_id, start_ms in starts.items():
        if attempt_id in ended:
            continue
        last_observed = max((value for record in records
                             if (value := record.get("endMs", record.get("atMs"))) is not None
                             and value >= start_ms), default=start_ms)
        append_timing(run_dir, {"kind": "run-end", "attemptId": attempt_id,
                                "atMs": last_observed, "status": "interrupted"})


def _covered(intervals: list[tuple[float, float]]) -> float:
    if not intervals:
        return 0.0
    ordered = sorted((start, end) for start, end in intervals if end >= start)
    if not ordered:
        return 0.0
    total = 0.0
    left, right = ordered[0]
    for start, end in ordered[1:]:
        if start > right:
            total += right - left
            left, right = start, end
        else:
            right = max(right, end)
    return total + right - left


def summarize_timing(records: list[dict[str, Any]]) -> dict[str, Any]:
    starts = {record["attemptId"]: record["atMs"] for record in records if record.get("kind") == "run-start"}
    ends = {record["attemptId"]: record for record in records if record.get("kind") == "run-end"}
    attempts = [{"attemptId": attempt_id, "status": ends[attempt_id]["status"],
                 "durationMs": round(max(0.0, ends[attempt_id]["atMs"] - start), 2)}
                for attempt_id, start in starts.items() if attempt_id in ends]
    open_attempts = [attempt_id for attempt_id in starts if attempt_id not in ends]
    nodes = [record for record in records if record.get("kind") == "node"
             and isinstance(record.get("startMs"), (int, float))
             and isinstance(record.get("endMs"), (int, float))]
    stages: list[dict[str, Any]] = []
    for name in dict.fromkeys(record["node"] for record in nodes):
        selected = [record for record in nodes if record["node"] == name]
        intervals = [(record["startMs"], record["endMs"]) for record in selected]
        stages.append({"name": name, "calls": len(selected),
                       "sumMs": round(sum(record["durationMs"] for record in selected), 2),
                       "coveredMs": round(_covered(intervals), 2),
                       "cachedCalls": sum(bool(record.get("cached")) for record in selected),
                       "failedCalls": sum(record.get("status") == "failed" for record in selected)})
    rounds: list[dict[str, Any]] = []
    for index in sorted({record.get("roundIndex") for record in nodes
                         if isinstance(record.get("roundIndex"), int) and record["roundIndex"] > 0}):
        selected = [record for record in nodes if record.get("roundIndex") == index]
        def intervals(*names: str) -> list[tuple[float, float]]:
            return [(record["startMs"], record["endMs"]) for record in selected if record["node"] in names]
        design = [(record["startMs"], record["endMs"]) for record in selected
                  if record["node"] == "prepare_design" and record.get("phase") == "parallel"]
        source = [(record["startMs"], record["endMs"]) for record in selected
                  if record["node"] == "prepare_source" and record.get("phase") == "parallel"]
        parallel = design + source
        prepare = intervals("prepare_design", "prepare_source", "join_preparation", "bind_images")
        qa = intervals("verify", "make_packet", "record_round")
        repair = intervals("diagnose", "apply", "rollback")
        round_entry = {"index": index,
                       "prepareWallMs": round(_covered(prepare), 2),
                       "qaWallMs": round(_covered(qa), 2),
                       "repairWallMs": round(_covered(repair), 2),
                       "coveredMs": round(_covered(intervals(*{record["node"] for record in selected})), 2)}
        if parallel:
            round_entry["parallelPreparation"] = {
                "designMs": round(sum(end - start for start, end in design), 2),
                "sourceMs": round(sum(end - start for start, end in source), 2),
                "wallMs": round(_covered(parallel), 2),
                "overlapMs": round(max(0.0, sum(end - start for start, end in parallel) - _covered(parallel)), 2),
            }
        rounds.append(round_entry)
    node_intervals = [(record["startMs"], record["endMs"]) for record in nodes]
    setup_intervals = [(record["startMs"], record["endMs"]) for record in nodes
                       if record.get("roundIndex") == 0]
    active_wall = sum(attempt["durationMs"] for attempt in attempts)
    first_start = min(starts.values()) if starts else None
    last_end = max((record["atMs"] for record in ends.values()), default=None)
    return {"schemaVersion": 1, "attempts": attempts, "openAttempts": open_attempts,
            "activeWallMs": round(active_wall, 2),
            "elapsedWallMs": round(last_end - first_start, 2) if first_start is not None and last_end is not None else None,
            "setupWallMs": round(_covered(setup_intervals), 2),
            "nodeCoveredMs": round(_covered(node_intervals), 2),
            "unattributedMs": round(max(0.0, active_wall - _covered(node_intervals)), 2),
            "stages": stages, "rounds": rounds}


def write_timing_summary(run_dir: Path) -> dict[str, Any]:
    result = summarize_timing(read_timing(run_dir))
    (run_dir / "timing-summary.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result
