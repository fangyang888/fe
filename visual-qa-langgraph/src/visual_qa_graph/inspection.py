"""Python acceptance rules over a read-only snapshot of the captured page."""

from __future__ import annotations

import re
from typing import Any


CSS_DEFAULTS = {"preferFlex": True, "allowGap": False, "preferRem": False,
                "preferResponsivePage": True, "rejectSuspiciousCss": True,
                "failOnMismatch": True, "failOnSeverity": "error", "scopeSelector": "body",
                "pageShellSelector": ":scope > :first-child", "positionContextMaxDepth": 2,
                "ignoreSelectors": []}

# Only DOM access is JavaScript; policy, geometry and pass/fail decisions live in Python.
SNAPSHOT = r"""({rules, selectors}) => {
  const scope = document.querySelector(rules.scopeSelector);
  const rect = e => { const r = e.getBoundingClientRect(); return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}; };
  const visible = e => { const s=getComputedStyle(e), r=e.getBoundingClientRect(); return s.display!=='none' && !['hidden','collapse'].includes(s.visibility) && +s.opacity>0 && r.width>0 && r.height>0; };
  const selector = e => {
    if(e===document.documentElement)return 'html';
    if(e.id) return '#'+CSS.escape(e.id);
    if(e.dataset.visual) return '[data-visual='+JSON.stringify(e.dataset.visual)+']';
    const named=e.tagName.toLowerCase()+[...e.classList].slice(0,2).map(c=>'.'+CSS.escape(c)).join('');
    if(e.classList.length && document.querySelectorAll(named).length===1)return named;
    const parts=[]; for(let n=e;n && n!==document.documentElement;n=n.parentElement) {
      const siblings=[...n.parentElement.children].filter(x=>x.tagName===n.tagName);
      parts.unshift(n.tagName.toLowerCase()+':nth-of-type('+(siblings.indexOf(n)+1)+')');
      if(n.parentElement.id) {parts.unshift('#'+CSS.escape(n.parentElement.id)); break;}
    } return parts.join(' > ');
  };
  const all=[...document.querySelectorAll('*')];
  const ids=new Map(all.map((e,i)=>[e,i]));
  const shells=scope ? [...scope.querySelectorAll(rules.pageShellSelector)] : [];
  if(scope && scope.matches(rules.pageShellSelector)) shells.push(scope);
  const properties=['position','display','width','height','font-family','font-size','line-height','transform','overflow','row-gap','column-gap','z-index'];
  const elements=all.map(e=>{
    const s=getComputedStyle(e); let p=e.parentElement, depth=1;
    while(p && getComputedStyle(p).position==='static' && p!==scope) {p=p.parentElement;depth++;}
    const hasPositioned=p && getComputedStyle(p).position!=='static' && scope && (p===scope || scope.contains(p));
    return {id:ids.get(e),selector:selector(e),bounds:rect(e),visible:visible(e),
      inScope:!!scope && (e===scope || scope.contains(e)), isScope:e===scope,
      ignored:rules.ignoreSelectors.some(q=>e.matches(q)||e.closest(q)), shell:shells.includes(e),
      positionedDepth:hasPositioned?depth:null,
      styles:Object.fromEntries(properties.map(k=>[k,s.getPropertyValue(k)])),
      imageSource:e instanceof HTMLImageElement?(e.currentSrc||e.src):(/url\(/.test(s.backgroundImage)?s.backgroundImage:null),
      visibleChildren:[...e.querySelectorAll('*')].filter(visible).length,
      visibleText:[...e.childNodes].some(n=>n.nodeType===3 && n.textContent.trim()),
      pseudoContent:['::before','::after'].some(p=>{const c=getComputedStyle(e,p);return c.display!=='none' && !['none','normal','""',"''"].includes(c.content);})};
  });
  const declarations=[], inaccessible=[];
  const walk=(list,owned)=>{ for(const r of list) {
    if(r instanceof CSSMediaRule && !matchMedia(r.conditionText).matches) continue;
    if(r instanceof CSSSupportsRule && !CSS.supports(r.conditionText)) continue;
    if(r instanceof CSSStyleRule) {
      let matches=[]; try {matches=[...document.querySelectorAll(r.selectorText)];} catch {continue;}
      declarations.push({selector:r.selectorText,ids:matches.map(e=>ids.get(e)),owned,
        root:matches.includes(document.documentElement), universal:/^\s*\*(?:::before|::after)?\s*$/.test(r.selectorText),
        values:Object.fromEntries([...r.style].map(k=>[k,r.style.getPropertyValue(k).trim()]))});
    } else if(r.cssRules) walk(r.cssRules,owned);
  }};
  const owns=list=>[...list].some(r=>r instanceof CSSStyleRule ? shells.some(e=>{try{return e.matches(r.selectorText)}catch{return false}}) : r.cssRules && owns(r.cssRules));
  for(const sheet of document.styleSheets) {if(sheet.ownerNode?.dataset.visualQaInternal)continue;
    try {walk(sheet.cssRules,owns(sheet.cssRules));} catch {inaccessible.push(sheet.href||'<inline>');}}
  for(const e of all) if(e.style?.length) declarations.push({selector:selector(e),ids:[ids.get(e)],owned:true,
    root:e===document.documentElement,values:Object.fromEntries([...e.style].map(k=>[k,e.style.getPropertyValue(k).trim()]))});
  const selected=Object.fromEntries(selectors.map(q=>[q,[...document.querySelectorAll(q)].map(e=>{
    const s=getComputedStyle(e); return {...elements[ids.get(e)],styles:Object.fromEntries([...s].map(k=>[k,s.getPropertyValue(k).trim()]))};})]));
  return {elements,declarations,selected,scroll:{x:scrollX,y:scrollY},scopeFound:!!scope,inaccessibleStylesheets:inaccessible};
}"""


def inspect_css(snapshot: dict, rules: dict) -> dict:
    violations = []
    seen = set()

    def add(rule: str, selector: str, message: str, severity: str = "error", **details: Any):
        key = (rule, selector, details.get("property"), details.get("value"))
        if key not in seen:
            seen.add(key)
            violations.append({"rule": rule, "severity": severity, "selector": selector, "message": message, **details})

    if not snapshot["scopeFound"]:
        add("page-shell", rules["scopeSelector"], "CSS scope was not found")
    elements = {e["id"]: e for e in snapshot["elements"] if e["inScope"] and e["visible"] and not e["ignored"]}
    if rules["preferResponsivePage"] and not any(e["shell"] for e in elements.values()):
        add("page-shell", rules["pageShellSelector"], "Page shell was not found")
    for e in elements.values():
        css, selector = e["styles"], e["selector"]
        if rules["preferFlex"] and css["display"] in {"grid", "inline-grid"}:
            add("prefer-flex", selector, "Use flex for this project's layout policy")
        if not rules["allowGap"] and css["display"] in {"flex", "inline-flex", "grid", "inline-grid"}:
            if any(css[k] not in {"normal", "0", "0px"} for k in ("row-gap", "column-gap")):
                add("no-gap", selector, "Use child margins instead of gap")
        if not e["isScope"] and css["position"] == "absolute":
            if e["positionedDepth"] is None:
                add("absolute-position-context", selector, "No positioned ancestor inside the configured scope")
            elif e["positionedDepth"] > rules["positionContextMaxDepth"]:
                add("absolute-position-context", selector, "Positioned ancestor is too distant", "warning")
    for decl in snapshot["declarations"]:
        matched = [elements[i] for i in decl["ids"] if i in elements]
        values, selector = decl["values"], decl["selector"]
        if rules["rejectSuspiciousCss"] and decl["owned"]:
            if decl.get("universal"):
                add("global-style-leak", selector, "Page stylesheet contains a universal reset", "warning")
            if decl.get("root"):
                for prop in ("font-size", "background", "background-color"):
                    if prop in values:
                        add("global-style-leak", selector, "Page stylesheet changes the project root", property=prop, value=values[prop])
        if not matched:
            continue
        for prop, value in values.items():
            if rules["preferResponsivePage"] and any(e["shell"] for e in matched) and prop in {
                "width", "height", "min-width", "min-height", "max-width", "max-height"
            } and re.fullmatch(r"-?(?:\d+|\d*\.\d+)(?:px|r?em|cm|mm|in|pt|pc|q)", value, re.I):
                add("responsive-page-size", selector, "Keep the outer page shell fluid", property=prop, value=value)
            plain = re.sub(r"url\([^)]*\)", "", value, flags=re.I)
            if rules["preferRem"] and decl["owned"] and prop != "content" and any(
                abs(float(n)) > 1 for n in re.findall(r"(-?(?:\d+|\d*\.\d+))px\b", plain, re.I)
            ):
                add("prefer-rem", selector, "Project policy requires rem for fixed lengths over 1px", property=prop, value=value)
            if rules["rejectSuspiciousCss"] and (prop == "zoom" or re.search(r"-?\d+\.\d{3,}px|url\([\"']?data:image/", value)):
                add("suspicious-css", selector, "Avoid zoom, embedded CSS images and excessive subpixel precision", "warning", property=prop, value=value)
        if rules["rejectSuspiciousCss"] and values.get("position") in {"absolute", "fixed"} and (
            all(p in values for p in ("width", "left", "right")) or all(p in values for p in ("height", "top", "bottom"))
        ):
            add("suspicious-css", selector, "Positioned geometry is over-constrained", "warning")
    if rules["preferRem"] and snapshot["inaccessibleStylesheets"]:
        add("unreadable-stylesheet", rules["scopeSelector"], "Cannot verify authored rem units in cross-origin stylesheets")
    counts = {severity: sum(v["severity"] == severity for v in violations) for severity in ("error", "warning", "info")}
    return {**rules, "passed": not counts["error"] and (rules["failOnSeverity"] != "warning" or not counts["warning"]),
            "violations": violations, "counts": counts, "inaccessibleStylesheets": snapshot["inaccessibleStylesheets"]}


def structure_config(case: dict, plan: dict | None) -> dict | None:
    configured = case.get("structure")
    regions = list((configured or {}).get("regions", []))
    derived = []
    images = [region for region in (plan or {}).get("regions", [])
              if region.get("mode") == "single-image" and region.get("export") is not False]
    by_id = {region["id"]: region for region in images}
    children: dict[str, list[dict]] = {}
    for region in images:
        parent_id = region.get("parentRegionId")
        if parent_id:
            if parent_id not in by_id:
                raise ValueError(f"Image {region['id']} has an unknown parentRegionId")
            children.setdefault(parent_id, []).append(region)
    for region in images:
        if not region.get("selector"):
            raise ValueError("Opaque images require a DOM selector before verification")
        child_images = children.get(region["id"], [])
        image_type = "composite-image" if child_images else "single-image"
        existing = next((r for r in regions if r["selector"] == region["selector"]), None)
        if existing and existing["type"] != image_type:
            raise ValueError(f"Image {region['id']} requires {image_type} structure")
        if existing and not child_images and existing.get("requireNoVisibleChildren") is False:
            raise ValueError("Intent plan requires one opaque image without visible children")
        if existing:
            continue
        if child_images:
            derived.append({"name": region.get("name", region["id"]), "type": "composite-image",
                            "selector": region["selector"],
                            "base": {"selector": region["selector"], "requireNoVisibleChildren": False},
                            "overlays": [{"selector": child["selector"],
                                          "requireNoVisibleChildren": child["id"] not in children}
                                         for child in child_images]})
        else:
            derived.append({"name": region.get("name", region["id"]), "type": "single-image", "selector": region["selector"]})
    if not regions and not derived:
        return None
    return {"regions": regions + derived, "failOnMismatch": True if derived or plan and any(
        r.get("mode") == "single-image" and r.get("export") is not False for r in plan.get("regions", [])
    ) else (configured or {}).get("failOnMismatch", True)}


def inspect_structure(page: Any, snapshot: dict, config: dict) -> dict:
    results = []
    for region in config["regions"]:
        checks = []

        def check(name, passed, message):
            checks.append({"check": name, "passed": bool(passed), "message": message})

        def element(spec, image=True):
            matches = snapshot["selected"][spec["selector"]]
            check("unique-element", len(matches) == 1, f"{spec['selector']} matched {len(matches)} elements")
            if len(matches) != 1:
                return None
            e = matches[0]
            check("visible", e["visible"], f"{spec['selector']} must be visible")
            if image:
                check("image-source", e["imageSource"], f"{spec['selector']} must render an img or background URL")
                if spec.get("requireNoVisibleChildren", True):
                    check("no-visible-children", not (e["visibleChildren"] or e["visibleText"] or e["pseudoContent"]),
                          f"{spec['selector']} must contain only the exported image")
            return e

        if region["type"] == "single-image":
            element(region)
        elif region["type"] == "composite-image":
            container, base = element(region, False), element(region["base"])
            if container and base:
                check("base-inside-container", _contains(container["bounds"], base["bounds"]), "Base must remain within the container")
            for overlay in region["overlays"]:
                top = element(overlay)
                if not base or not top:
                    continue
                a, b = base["bounds"], top["bounds"]
                if overlay.get("mustOverlap", True):
                    check("overlaps-base", _overlap(a, b) > 0, "Overlay must overlap the base")
                if overlay.get("mustOverflowBase", False):
                    check("overflows-base", not _contains(a, b), "Overlay must extend beyond the base")
                if overlay.get("mustBeAboveBase", True):
                    above = page.evaluate("""([a,b])=>{const base=document.querySelector(a), top=document.querySelector(b);
                      const x=base.getBoundingClientRect(), y=top.getBoundingClientRect();
                      const l=Math.max(x.left,y.left), r=Math.min(x.right,y.right), t=Math.max(x.top,y.top), d=Math.min(x.bottom,y.bottom);
                      if(l>=r||t>=d)return false;
                      const stack=document.elementsFromPoint((l+r)/2,(t+d)/2);
                      const i=stack.indexOf(top),j=stack.indexOf(base);return i>=0 && j>=0 && i<j;}""",
                                          [region["base"]["selector"], overlay["selector"]])
                    check("above-base", above, "Overlay paint order must be confirmed")
        else:
            raise ValueError(f"Unsupported structure region type: {region['type']}")
        results.append({"name": region["name"], "selector": region["selector"], "type": region["type"],
                        "checks": checks, "passed": all(c["passed"] for c in checks)})
    return {"regions": results, "passed": all(r["passed"] for r in results), "failOnMismatch": config.get("failOnMismatch", True)}


def _contains(a, b):
    return a["x"] <= b["x"] and a["y"] <= b["y"] and a["x"] + a["width"] >= b["x"] + b["width"] and a["y"] + a["height"] >= b["y"] + b["height"]


def _overlap(a, b):
    return max(0, min(a["x"] + a["width"], b["x"] + b["width"]) - max(a["x"], b["x"])) * max(
        0, min(a["y"] + a["height"], b["y"] + b["height"]) - max(a["y"], b["y"]))


def inspect_measurements(snapshot: dict, contract: dict) -> dict:
    issues, measurements = [], []
    by_name = {spec["name"]: snapshot["selected"][spec["selector"]] for spec in contract["elements"]}
    for spec in contract["elements"]:
        matches = by_name[spec["name"]]

        def check(prop, expected, actual, tolerance=None):
            tolerance = contract.get("tolerance", 1) if tolerance is None else tolerance
            numeric = isinstance(expected, (int, float)) and isinstance(actual, (int, float))
            if abs(expected - actual) <= tolerance if numeric else expected == actual:
                return
            issues.append({"id": f"{spec['name']}:{prop}", "element": spec["name"], "selector": spec["selector"],
                           "property": prop, "expected": expected, "actual": actual,
                           **({"delta": actual - expected, "tolerance": tolerance} if numeric else {})})

        measurements.append({"name": spec["name"], "count": len(matches), **(matches[0] if len(matches) == 1 else {})})
        if len(matches) != 1:
            check("matchCount", 1, len(matches), 0)
            continue
        e = matches[0]
        if not e["visible"]:
            check("visibility", "visible", "hidden")
            continue
        for prop, expected in spec.get("bounds", {}).items():
            check(f"bounds.{prop}", expected, e["bounds"][prop])
        for prop, expected in spec.get("styles", {}).items():
            actual = e["styles"].get(prop, "")
            if isinstance(expected, (int, float)) and re.fullmatch(r"-?(?:\d+\.?\d*|\.\d+)px", actual):
                actual = float(actual[:-2])
            check(f"styles.{prop}", expected, actual)
        for relation in spec.get("relations", []):
            target = by_name[relation["target"]]
            actual = "target unavailable"
            if len(target) == 1 and target[0]["visible"]:
                a, b = e["bounds"], target[0]["bounds"]
                actual = {"gapY": a["y"] - b["y"] - b["height"], "gapX": a["x"] - b["x"] - b["width"],
                          "alignLeft": a["x"] - b["x"], "alignTop": a["y"] - b["y"],
                          "centerX": a["x"] + a["width"] / 2 - b["x"] - b["width"] / 2}[relation["metric"]]
            check(f"relations.{relation['metric']}:{relation['target']}", relation["expected"], actual, relation.get("tolerance"))
    return {"passed": not issues, "failOnMismatch": contract.get("failOnMismatch", True), "issues": issues, "measurements": measurements}


def associate_regions(regions: list, snapshot: dict, scale: float, full_page: bool = False) -> None:
    for region in regions:
        candidates = []
        for e in snapshot["elements"]:
            if not e["visible"]:
                continue
            box = {k: v * scale for k, v in e["bounds"].items()}
            if not full_page:
                for key in ("x", "y"):
                    box[key] -= snapshot.get("scroll", {}).get(key, 0) * scale
            overlap = _overlap(region, box)
            if overlap:
                score = overlap / (region["width"] * region["height"] + box["width"] * box["height"] - overlap)
                candidates.append((score, {"selector": e["selector"], "bounds": box, "styles": e["styles"]}))
        region["domCandidates"] = [entry for _, entry in sorted(candidates, key=lambda x: x[0], reverse=True)[:2]]
