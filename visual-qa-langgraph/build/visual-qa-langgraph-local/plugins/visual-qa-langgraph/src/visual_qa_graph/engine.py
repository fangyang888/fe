"""Standalone Playwright Python capture and final-mode acceptance."""

from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

from .comparison import compare_images, thresholds, write_crops
from .inspection import (CSS_DEFAULTS, SNAPSHOT, associate_regions, inspect_css,
                         inspect_measurements, inspect_structure, structure_config)


def read_case(path: Path) -> dict:
    case = json.loads(path.read_text(encoding="utf-8"))
    if case.get("platform", "web") != "web":
        raise ValueError("Only Web cases are supported")
    for key in ("name", "url", "designImage"):
        if not isinstance(case.get(key), str) or not case[key].strip():
            raise ValueError(f"case.{key} is required")
    viewport = {"deviceScaleFactor": 1, **case.get("viewport", {})}
    for key in ("width", "height", "deviceScaleFactor"):
        value = viewport.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
            raise ValueError(f"Invalid viewport.{key}")
        if key != "deviceScaleFactor" and type(value) is not int:
            raise ValueError(f"viewport.{key} must be an integer")
    case["viewport"] = viewport
    case["thresholds"] = thresholds(case.get("thresholds"))
    case["cssRules"] = {**CSS_DEFAULTS, **case.get("cssRules", {})}
    if case["cssRules"]["failOnSeverity"] not in {"error", "warning"}:
        raise ValueError("cssRules.failOnSeverity must be error or warning")
    case["wait"] = {"timeoutMs": 15000, "networkIdle": True, "stableFrames": 3, **case.get("wait", {})}
    for key in ("timeoutMs", "stableFrames"):
        if type(case["wait"][key]) is not int or case["wait"][key] <= 0:
            raise ValueError(f"wait.{key} must be a positive integer")
    for key in ("designImage", "intentPlan", "outputDir"):
        if key in case:
            case[key] = str((path.parent / case[key]).resolve())
    case.setdefault("outputDir", str((path.parent / "artifacts" / case["name"]).resolve()))
    critical = case.get("criticalRegions", [])
    if not isinstance(critical, list) or len(critical) > 16 or len({r.get("name") for r in critical}) != len(critical):
        raise ValueError("criticalRegions requires at most 16 uniquely named regions")
    for region in critical:
        if not region.get("name"):
            raise ValueError("criticalRegions.name is required")
        thresholds(region.get("thresholds"))
    contract = case.get("contract")
    if contract:
        elements = contract.get("elements", [])
        names = {e.get("name") for e in elements}
        if not elements or len(names) != len(elements) or not all(names):
            raise ValueError("contract.elements requires unique names")
        for e in elements:
            if not e.get("selector"):
                raise ValueError("contract element selector is required")
            for key, value in e.get("bounds", {}).items():
                if key not in {"x", "y", "width", "height"} or not isinstance(value, (int, float)) or not math.isfinite(value):
                    raise ValueError("Invalid contract bounds")
            for r in e.get("relations", []):
                if r.get("target") not in names or r.get("metric") not in {"gapY", "gapX", "alignLeft", "alignTop", "centerX"}:
                    raise ValueError("Invalid contract relation")
        for spec in [contract, *(r for e in elements for r in e.get("relations", []))]:
            value = spec.get("tolerance", 1)
            if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValueError("Invalid contract tolerance")
    return case


RESOURCES = r"""async timeout => {
  const bounded = p => new Promise(resolve => {const timer=setTimeout(()=>resolve(false),timeout);
    Promise.resolve(p).then(v=>{clearTimeout(timer);resolve(v)},()=>{clearTimeout(timer);resolve(false)});});
  const urls=new Set();
  for(const e of document.querySelectorAll('*')) for(const p of [null,'::before','::after']) {
    const s=getComputedStyle(e,p); for(const m of s.backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/g)) urls.add(m[1]);
  }
  const images=[...document.images];
  const backgrounds=[...urls].map(url=>{const i=new Image();i.src=url;return i});
  const [fontsReady,results]=await Promise.all([
    bounded(document.fonts.ready.then(()=>document.fonts.status==='loaded' && [...document.fonts].every(f=>f.status!=='error'))),
    Promise.all([...images,...backgrounds].map(i=>bounded(i.decode().then(()=>i.naturalWidth>0))))]);
  return {fontsReady,imagesTotal:results.length,imagesFailed:[...images,...backgrounds].filter((i,n)=>!results[n]).map(i=>i.currentSrc||i.src||'<unknown image>')};
}"""


LAYOUT = r"""async ({timeout,frames}) => {
  let previous='', stable=0;
  const sample=()=>JSON.stringify([...document.querySelectorAll('*')].map(e=>{
    const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height];}));
  const deadline=performance.now()+timeout;
  while(performance.now()<deadline) {
    const current=sample();stable=current===previous?stable+1:0;previous=current;
    if(stable>=frames)return true;
    await new Promise(resolve=>setTimeout(resolve,50));
  } return false;
}"""


def wait_for_readiness(page: Any, config: dict) -> dict:
    started = time.perf_counter()
    deadline = started + config["timeoutMs"] / 1000
    remaining = lambda: max(1, int((deadline - time.perf_counter()) * 1000))
    if config["networkIdle"] and not config.get("readyExpression"):
        try:
            page.wait_for_load_state("networkidle", timeout=min(5000, remaining()))
        except PlaywrightTimeout:
            pass
    if config.get("selector"):
        page.locator(config["selector"]).wait_for(state="visible", timeout=remaining())
    if config.get("readyExpression"):
        page.wait_for_function(config["readyExpression"], timeout=remaining())
    result = page.evaluate(RESOURCES, remaining())
    result["layoutStable"] = page.evaluate(LAYOUT, {"timeout": remaining(), "frames": config["stableFrames"]})
    result["timings"] = {"totalMs": round((time.perf_counter() - started) * 1000, 2)}
    return result


def verify_case(case_path: Path, *, browser_endpoint: str | None = None) -> dict:
    started = time.perf_counter()
    case = read_case(case_path)
    output = Path(case["outputDir"])
    output.mkdir(parents=True, exist_ok=True)
    actual_path, diff_path = output / "actual.png", output / "diff.png"
    plan = json.loads(Path(case["intentPlan"]).read_text()) if case.get("intentPlan") else None
    if plan and (plan.get("status") != "ready" or plan.get("schemaVersion") != 1 or
                 plan.get("kind") not in {"visual-qa-intent-plan", "visual-qa-langgraph-intent-plan"}):
        raise ValueError("Verification requires a ready intent plan with schemaVersion 1")
    structure = structure_config(case, plan)
    selectors = set()
    for region in (structure or {}).get("regions", []):
        selectors.add(region["selector"])
        if region["type"] == "composite-image":
            selectors.add(region["base"]["selector"])
            selectors.update(o["selector"] for o in region["overlays"])
    selectors.update(e["selector"] for e in case.get("contract", {}).get("elements", []))
    errors = []
    timings = {}
    with sync_playwright() as playwright:
        acquired = time.perf_counter()
        if browser_endpoint:
            browser = (playwright.chromium.connect_over_cdp(browser_endpoint) if browser_endpoint.startswith(("http://", "https://")) or
                       "/devtools/browser/" in browser_endpoint else playwright.chromium.connect(browser_endpoint))
        else:
            channel = case.get("browserChannel", "chrome")
            browser = playwright.chromium.launch(headless=True, **({"channel": channel} if channel != "chromium" else {}))
        timings["browserAcquireMs"] = round((time.perf_counter() - acquired) * 1000, 2)
        timings["browserMode"] = "connected" if browser_endpoint else "launched"
        context = None
        try:
            viewport = case["viewport"]
            context = browser.new_context(viewport={k: viewport[k] for k in ("width", "height")},
                device_scale_factor=viewport["deviceScaleFactor"], locale=case.get("locale", "zh-CN"),
                timezone_id=case.get("timezoneId", "Asia/Shanghai"), color_scheme=case.get("colorScheme", "light"), reduced_motion="reduce")
            page = context.new_page()

            def console(message):
                filename = Path(urlparse(message.location.get("url", "")).path).name.lower()
                if message.type == "error" and not (filename.startswith("favicon.") and re_404(message.text)):
                    errors.append(message.text)

            page.on("console", console)
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(case["url"], wait_until="domcontentloaded", timeout=case["wait"]["timeoutMs"])
            style = page.add_style_tag(content="*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;caret-color:transparent!important;scroll-behavior:auto!important}")
            style.evaluate("e=>e.dataset.visualQaInternal='true'")
            if case.get("styleOverrides"):
                page.add_style_tag(content=case["styleOverrides"])
            readiness = wait_for_readiness(page, case["wait"])
            snapshot = page.evaluate(SNAPSHOT, {"rules": case["cssRules"], "selectors": sorted(selectors)})
            capture = {"url": page.url, "title": page.title(), "outputPath": str(actual_path),
                       "viewport": viewport, "readiness": readiness, "consoleErrors": errors,
                       "cssRules": inspect_css(snapshot, case["cssRules"]), "timings": timings}
            if structure:
                capture["structure"] = inspect_structure(page, snapshot, structure)
            if case.get("contract"):
                capture["measurement"] = inspect_measurements(snapshot, case["contract"])
            page.screenshot(path=str(actual_path), full_page=case.get("fullPage", False), animations="disabled")
        finally:
            try:
                if context:
                    context.close()
            finally:
                browser.close()
    comparison = compare_images(Path(case["designImage"]), actual_path, diff_path, case["thresholds"], case.get("criticalRegions"))
    associate_regions(comparison["differenceRegions"], snapshot, case["viewport"]["deviceScaleFactor"], case.get("fullPage", False))
    passed = comparison["passed"] and readiness["fontsReady"] and readiness["layoutStable"] and not readiness["imagesFailed"] and not errors
    for kind in ("cssRules", "structure", "measurement"):
        check = capture.get(kind, {})
        if check.get("failOnMismatch", True) and check.get("passed") is False:
            passed = False
    crops = write_crops(Path(case["designImage"]), actual_path, comparison["differenceRegions"], output / "crops") if not passed else []
    report_path = output / "report.json"
    report = {"name": case["name"], "engine": "visual-qa-langgraph", "status": "passed" if passed else "failed", "mode": "final",
              "comparison": comparison, "capture": capture, "reportPath": str(report_path),
              "artifacts": {"design": case["designImage"], "actual": str(actual_path), "diff": str(diff_path),
                            "report": str(report_path), "diagnosticCrops": crops},
              "timings": {"totalMs": round((time.perf_counter() - started) * 1000, 2)}}
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def re_404(message: str) -> bool:
    return "404" in message or "not found" in message.lower()
