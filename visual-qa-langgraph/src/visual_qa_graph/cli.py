"""Command line entry point."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

from .workflow import run_workflow


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] in {"verify", "capture", "compare", "suite", "doctor", "intent-plan"}:
        from .commands import main as command_main
        return command_main(sys.argv[1:])
    parser = argparse.ArgumentParser(description="Run visual QA with Python + LangGraph",
        epilog="Standalone commands: verify, compare, suite, doctor, intent-plan. Use COMMAND --help for options.")
    parser.add_argument("--case", type=Path, required=True)
    parser.add_argument("--run-dir", type=Path)
    parser.add_argument("--cache-dir", type=Path, help="Shared content cache across runs")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[3])
    parser.add_argument("--browser-endpoint", help="Optional CDP HTTP/WebSocket or Playwright endpoint; otherwise launch Chrome directly")
    parser.add_argument("--pixso-endpoint", help="Pixso MCP HTTP endpoint, for example http://127.0.0.1:3667/mcp")
    parser.add_argument("--pixso-revision", help="Explicit design revision used for remote cache invalidation")
    parser.add_argument("--pixso-refresh", action="store_true", help="Ignore cached Pixso design and assets")
    parser.add_argument("--annotated-image", type=Path, help="Screenshot with red frames marking whole-image nodes")
    parser.add_argument("--image-map", type=Path, help="Optional intent JSON mapping red-frame order to Pixso nodeId and DOM selector")
    parser.add_argument("--image-html", type=Path, help="Static HTML page whose matched placeholders receive exported images")
    parser.add_argument("--annotated-frame", help="Screenshot design frame as x,y,width,height when automatic framing is ambiguous")
    parser.add_argument("--offline-actual", type=Path, help="Compare an existing screenshot; cannot complete final acceptance")
    parser.add_argument("--model", help="Optional OpenAI model for failed-region diagnosis")
    parser.add_argument("--auto-fix", action="store_true", default=None, help="Allow bounded model edits to --source files after failed verification")
    parser.add_argument("--max-fixes", type=int, help="Maximum model edit and reverify rounds (default: 2; preserved on resume)")
    parser.add_argument("--resume", action="store_true", help="Resume an interrupted run from its SQLite checkpoint")
    parser.add_argument("--source", type=Path, action="append", help="Source file to fingerprint and scan; repeat as needed")
    parser.add_argument("--project-skill", type=Path, help="Project SKILL.md with a visual-qa-langgraph-policy block for CSS units and layout")
    args = parser.parse_args()
    if args.auto_fix and not args.model and not args.resume:
        parser.error("--auto-fix requires --model")
    if args.max_fixes is not None and not 1 <= args.max_fixes <= 5:
        parser.error("--max-fixes must be between 1 and 5")
    if args.pixso_endpoint and not args.pixso_revision and not args.resume:
        parser.error("--pixso-endpoint requires --pixso-revision")
    if args.resume and not args.run_dir:
        parser.error("--resume requires --run-dir")
    if args.annotated_image and not args.pixso_endpoint and not args.resume:
        parser.error("--annotated-image requires --pixso-endpoint")
    if (args.image_map or args.image_html or args.annotated_frame) and not args.annotated_image and not args.resume:
        parser.error("--image-map, --image-html and --annotated-frame require --annotated-image")
    run_dir = args.run_dir or Path(__file__).resolve().parents[2] / "runs" / datetime.now().strftime("%Y%m%d-%H%M%S")
    cache_dir = args.cache_dir
    try:
        summary = run_workflow(case_path=args.case, run_dir=run_dir, repo_root=args.repo_root,
                               offline_actual=args.offline_actual, browser_endpoint=args.browser_endpoint,
                               model_name=args.model, cache_dir=cache_dir,
                               pixso_endpoint=args.pixso_endpoint, pixso_revision=args.pixso_revision,
                               pixso_refresh=args.pixso_refresh, auto_fix=args.auto_fix,
                               max_fixes=args.max_fixes, resume=args.resume,
                               source_paths=args.source, annotated_image=args.annotated_image,
                               image_map=args.image_map, image_html=args.image_html,
                               annotated_frame=args.annotated_frame,
                               project_skill=args.project_skill)
    except Exception as exc:
        print(json.dumps({"status": "error", "complete": False, "error": str(exc)},
                         ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if (summary.get("complete") is True and summary.get("status") == "passed"
                 and summary.get("mode") == "final") else 1


if __name__ == "__main__":
    sys.exit(main())

