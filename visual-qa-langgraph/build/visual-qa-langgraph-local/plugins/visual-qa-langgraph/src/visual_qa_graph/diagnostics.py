"""Bounded reasons for failures that pixel differences cannot explain."""

from typing import Any


def capture_failures(capture: dict[str, Any]) -> dict[str, Any]:
    failures: list[dict[str, Any]] = []
    counts: dict[str, int] = {}

    def add(kind: str, *, blocking: bool = True, **details: Any) -> None:
        counts[kind] = counts.get(kind, 0) + 1
        if counts[kind] > 6:
            return
        compact = {key: value[:500] if isinstance(value, str) else value
                   for key, value in details.items() if value is not None}
        failures.append({"kind": kind, "blocking": blocking, **compact})

    readiness = capture.get("readiness") or {}
    if readiness.get("fontsReady") is False:
        add("fonts", message="Fonts were not ready at capture time")
    if readiness.get("layoutStable") is False:
        add("layout", message="Layout did not stabilize before capture")
    for url in readiness.get("imagesFailed") or []:
        add("image", message=str(url))
    for message in capture.get("consoleErrors") or []:
        add("console", message=str(message))
    css = capture.get("cssRules") or {}
    violations = sorted(css.get("violations") or [],
                        key=lambda item: {"error": 0, "warning": 1}.get(item.get("severity"), 2))
    for violation in violations:
        blocking = bool(css.get("failOnMismatch", True) and (
            violation.get("severity") == "error" or (
                css.get("failOnSeverity") == "warning" and violation.get("severity") == "warning")))
        add("css", blocking=blocking, **{key: violation.get(key) for key in
            ("rule", "severity", "selector", "property", "value", "message")})
    if css.get("passed") is False and not css.get("violations"):
        add("css", blocking=css.get("failOnMismatch", True), message="CSS rule inspection failed")
    structure = capture.get("structure") or {}
    for region in structure.get("regions") or []:
        for check in region.get("checks") or []:
            if check.get("passed") is False:
                add("structure", blocking=structure.get("failOnMismatch", True),
                    region=region.get("name"), selector=region.get("selector"),
                    check=check.get("check"), message=check.get("message"))
    if structure.get("passed") is False and not counts.get("structure"):
        add("structure", blocking=structure.get("failOnMismatch", True), message="DOM structure inspection failed")
    measurement = capture.get("measurement") or {}
    for issue in measurement.get("issues") or []:
        add("measurement", blocking=measurement.get("failOnMismatch", True),
            selector=issue.get("selector"), property=issue.get("property"),
            expected=str(issue.get("expected")), actual=str(issue.get("actual")),
            message=str(issue.get("element", "Measurement mismatch")))
    if measurement.get("passed") is False and not measurement.get("issues"):
        add("measurement", blocking=measurement.get("failOnMismatch", True), message="Design measurement failed")
    failures.sort(key=lambda item: not item["blocking"])
    selected = failures[:24]
    return {"failures": selected, "failureCounts": counts,
            "omittedFailures": sum(counts.values()) - len(selected)}
