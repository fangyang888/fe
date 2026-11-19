"""Small Python command surface for standalone QA and benchmark suites."""

from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

from .comparison import compare_images
from .engine import read_case, verify_case, wait_for_readiness
from .intent import create_intent_plan


def capture_page(url: str, output: Path, *, width: int, height: int, dpr: float,
                 browser_channel: str, browser_endpoint: str | None, full_page: bool,
                 ready_expression: str | None, selector: str | None,
                 timeout_ms: int, stable_frames: int) -> dict:
    started = time.perf_counter()
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    errors = []
    with sync_playwright() as playwright:
        if browser_endpoint:
            browser = (playwright.chromium.connect_over_cdp(browser_endpoint) if browser_endpoint.startswith(("http://", "https://")) or
                       "/devtools/browser/" in browser_endpoint else playwright.chromium.connect(browser_endpoint))
        else:
            browser = playwright.chromium.launch(
                headless=True, **({"channel": browser_channel} if browser_channel != "chromium" else {}))
        context = None
        try:
            context = browser.new_context(viewport={"width": width, "height": height},
                device_scale_factor=dpr, locale="zh-CN", timezone_id="Asia/Shanghai",
                color_scheme="light", reduced_motion="reduce")
            page = context.new_page()
            page.on("console", lambda message: errors.append(message.text)
                    if message.type == "error" else None)
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            page.add_style_tag(content=(
                "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;"
                "transition-duration:0s!important;caret-color:transparent!important;scroll-behavior:auto!important}"
            ))
            readiness = wait_for_readiness(page, {
                "timeoutMs": timeout_ms, "networkIdle": True,
                "stableFrames": stable_frames,
                **({"readyExpression": ready_expression} if ready_expression else {}),
                **({"selector": selector} if selector else {}),
            })
            page.screenshot(path=str(output), full_page=full_page, animations="disabled")
        finally:
            try:
                if context:
                    context.close()
            finally:
                browser.close()
    passed = readiness["fontsReady"] and readiness["layoutStable"] and not readiness["imagesFailed"] and not errors
    return {"url": url, "outputPath": str(output), "viewport": {"width": width, "height": height, "deviceScaleFactor": dpr},
            "fullPage": full_page, "readiness": readiness, "consoleErrors": errors,
            "status": "captured" if passed else "failed",
            "timings": {"totalMs": round((time.perf_counter() - started) * 1000, 2)}}


def run_suite(path: Path, browser_endpoint: str | None) -> dict:
    suite = json.loads(path.read_text())
    if suite.get("schemaVersion") != 1 or not suite.get("cases"):
        raise ValueError("Suite needs schemaVersion 1 and nonempty cases")
    if suite.get("defaults", {}).get("mode", "final") != "final":
        raise ValueError("Python suites perform final verification only")
    concurrency = suite.get("concurrency", 1)
    if type(concurrency) is not int or not 1 <= concurrency <= 4:
        raise ValueError("Suite concurrency must be between 1 and 4")
    cases = [(path.parent / entry).resolve() for entry in suite["cases"]]
    outputs = [read_case(case)["outputDir"] for case in cases]
    if len(set(outputs)) != len(outputs):
        raise ValueError("Suite cases must have distinct output directories")

    def run(case):
        try:
            report = verify_case(case, browser_endpoint=browser_endpoint)
            return {"case": str(case), "name": report["name"], "status": report["status"],
                    "mode": report["mode"], "reportPath": report["reportPath"],
                    "mismatchPercent": report["comparison"]["mismatchPercent"], "ssim": report["comparison"]["ssim"]}
        except Exception as exc:
            return {"case": str(case), "status": "error", "error": str(exc)}

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        results = list(pool.map(run, cases))
    output = (path.parent / suite.get("outputDir", "suite-output")).resolve()
    output.mkdir(parents=True, exist_ok=True)
    result = {"name": suite.get("name", path.stem), "engine": "visual-qa-langgraph", "mode": "final",
              "status": "error" if any(r["status"] == "error" for r in results) else
                        "passed" if all(r["status"] == "passed" for r in results) else "failed",
              "cases": results, "reportPath": str(output / "report.json")}
    (output / "report.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="visual-qa-langgraph")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("verify", "doctor"):
        command = commands.add_parser(name)
        command.add_argument("--case", type=Path, required=True)
        command.add_argument("--browser-endpoint")
        command.add_argument("--compact", action="store_true")
    capture = commands.add_parser("capture")
    capture.add_argument("--url", required=True)
    capture.add_argument("--output", type=Path, required=True)
    capture.add_argument("--width", type=int, required=True)
    capture.add_argument("--height", type=int, required=True)
    capture.add_argument("--dpr", type=float, default=1)
    capture.add_argument("--browser-channel", default="chrome")
    capture.add_argument("--browser-endpoint")
    capture.add_argument("--full-page", action="store_true")
    capture.add_argument("--ready-expression")
    capture.add_argument("--selector")
    capture.add_argument("--wait-timeout-ms", type=int, default=15000)
    capture.add_argument("--stable-frames", type=int, default=3)
    capture.add_argument("--compact", action="store_true")
    compare = commands.add_parser("compare")
    compare.add_argument("--expected", type=Path, required=True)
    compare.add_argument("--actual", type=Path, required=True)
    compare.add_argument("--output", type=Path, required=True)
    compare.add_argument("--pixel-threshold", type=float, default=0.1)
    compare.add_argument("--max-mismatch-percent", type=float, default=1.5)
    compare.add_argument("--min-ssim", type=float, default=0.98)
    compare.add_argument("--compact", action="store_true")
    suite = commands.add_parser("suite")
    suite.add_argument("--suite", type=Path, required=True)
    suite.add_argument("--browser-endpoint")
    suite.add_argument("--compact", action="store_true")
    intent = commands.add_parser("intent-plan")
    intent.add_argument("--annotated", type=Path, required=True)
    intent.add_argument("--node-id", required=True)
    intent.add_argument("--width", type=int, required=True)
    intent.add_argument("--height", type=int, required=True)
    intent.add_argument("--design-url")
    intent.add_argument("--intent", type=Path)
    intent.add_argument("--frame")
    intent.add_argument("--output", type=Path, required=True)
    intent.add_argument("--compact", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.command == "verify":
            result = verify_case(args.case.resolve(), browser_endpoint=args.browser_endpoint)
        elif args.command == "capture":
            if args.width <= 0 or args.height <= 0 or args.dpr <= 0:
                raise ValueError("capture width, height and dpr must be positive")
            if args.wait_timeout_ms <= 0 or args.stable_frames <= 0:
                raise ValueError("capture wait timeout and stable frames must be positive")
            result = capture_page(args.url, args.output, width=args.width, height=args.height, dpr=args.dpr,
                browser_channel=args.browser_channel, browser_endpoint=args.browser_endpoint,
                full_page=args.full_page, ready_expression=args.ready_expression, selector=args.selector,
                timeout_ms=args.wait_timeout_ms, stable_frames=args.stable_frames)
        elif args.command == "compare":
            comparison = compare_images(args.expected.resolve(), args.actual.resolve(), args.output.resolve(), {
                "pixelThreshold": args.pixel_threshold, "maxMismatchPercent": args.max_mismatch_percent, "minSsim": args.min_ssim})
            result = {"status": "offline_review", "mode": "offline", "complete": False, "comparison": comparison}
        elif args.command == "suite":
            result = run_suite(args.suite.resolve(), args.browser_endpoint)
        elif args.command == "intent-plan":
            result = create_intent_plan(annotated=args.annotated.resolve(), node_id=args.node_id,
                viewport={"width": args.width, "height": args.height}, design_url=args.design_url,
                image_map=args.intent, frame=args.frame)
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        else:
            case = read_case(args.case.resolve())
            with Image.open(case["designImage"]) as image:
                size = image.size
            if case.get("intentPlan"):
                plan = json.loads(Path(case["intentPlan"]).read_text())
                if plan.get("status") != "ready":
                    raise ValueError("Intent plan must be ready")
            result = {"status": "ready", "engine": "visual-qa-langgraph", "designSize": size,
                      "browserChannel": case.get("browserChannel", "chrome"),
                      "note": "Local configuration validated; verify performs browser and readiness checks"}
    except Exception as exc:
        print(json.dumps({"status": "error", "complete": False, "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=None if args.compact else 2))
    return 2 if result["status"] == "error" else 0 if result["status"] in {"passed", "captured", "ready"} else 1
