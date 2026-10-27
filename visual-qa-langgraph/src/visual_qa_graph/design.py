"""Bounded, shallow Pixso reads and opaque-image-aware design context."""

from __future__ import annotations

from typing import Any


BOUNDARY_FIELDS = "x y width height size transform absoluteBoundingBox constraints layoutPositioning zIndex isMask blendMode visible".split()
DESIGN_FIELDS = BOUNDARY_FIELDS + "fillPaints strokePaints strokeWeight cornerRadius opacity nodeText fontSize fontName fontWeight lineHeight letterSpacing textAlignHorizontal textAlignVertical layoutMode itemSpacing paddingTop paddingRight paddingBottom paddingLeft clipsContent".split()


def image_entries(plan: dict) -> list[dict]:
    images = []
    for region in plan.get("regions", []):
        if region.get("export") is False:
            continue
        if region.get("mode") == "single-image":
            images.append({**region, "sourceRegionId": region["id"], "role": "single-image"})
        elif region.get("mode") == "layers":
            layers = [l for l in region.get("layers", []) if l.get("export") is not False]
            if not region.get("selector") or len(layers) < 2:
                raise ValueError("Composite images need a container selector and at least two layers")
            for index, layer in enumerate(layers, 1):
                images.append({**layer, "id": f"{region['id']}-layer-{index}", "sourceRegionId": region["id"],
                               "groupSelector": region["selector"], "role": layer.get("role", "overlay")})
    ids = [i.get("nodeId") for i in images]
    if not all(ids) or len(set(ids)) != len(ids):
        raise ValueError("Every image needs a unique nodeId before Pixso reads")
    selectors = [i.get("selector") for i in images if i["role"] == "single-image"]
    if not all(selectors) or len(set(selectors)) != len(selectors):
        raise ValueError("Every single image needs a unique selector")
    return images


def read_design_tree(client: Any, plan: dict, *, batch_size: int = 16) -> tuple[dict, list[str], list[dict]]:
    images = image_entries(plan)
    opaque = {image["nodeId"] for image in images}
    root = {"guid": plan["source"]["nodeId"]}
    if root["guid"] in opaque:
        raise ValueError("The entire frame is an image; export it without reading its internals")
    known, queried, responses = {root["guid"]: root}, [], []
    for _ in range(100):
        pending = [node_id for node_id in known if node_id not in opaque and node_id not in queried]
        if not pending:
            return root, queried, responses
        for start in range(0, len(pending), batch_size):
            batch = pending[start:start + batch_size]
            nodes = client.query_nodes(batch, ["guid", "name", "type", *DESIGN_FIELDS, "childNode"])
            if len(nodes) != len(batch) or {n.get("guid") for n in nodes} != set(batch):
                raise ValueError("Pixso returned unexpected or duplicate node IDs")
            for node in nodes:
                current = known[node["guid"]]
                current.update({k: node[k] for k in ("name", "type", *DESIGN_FIELDS) if k in node})
                children = node.get("childNode")
                if not isinstance(children, list):
                    raise ValueError("Pixso shallow read must confirm immediate children or an empty leaf")
                current["childNode"] = []
                for child in children:
                    node_id = child.get("guid")
                    if not isinstance(node_id, str) or not node_id or node_id in known:
                        raise ValueError("Malformed, cyclic or duplicate Pixso hierarchy")
                    fields = BOUNDARY_FIELDS if node_id in opaque else ["name", "type", *DESIGN_FIELDS]
                    clean = {"guid": node_id, **{k: child[k] for k in fields if k in child}}
                    known[node_id] = clean
                    current["childNode"].append(clean)
                # Keep a pruned snapshot; never retain an unsolicited grandchild.
                responses.append({**current, "childNode": [dict(c) for c in current["childNode"]]})
                queried.append(node["guid"])
    raise RuntimeError("Pixso design exceeded 100 shallow read levels")


def generation_context(plan: dict, root: dict) -> dict:
    images = image_entries(plan)
    by_id = {i["nodeId"]: i for i in images}
    found, blocked, allowed, hierarchy = set(), [], [], {}

    def visit(raw, ancestors, sibling):
        node_id = raw["guid"]
        h = {"parentNodeId": ancestors[-1] if ancestors else None,
             "ancestorNodeIds": ancestors, "sourceSiblingIndex": sibling}
        hierarchy[node_id] = h
        image = by_id.get(node_id)
        node = {"nodeId": node_id, "hierarchy": h, "representation": "single-image" if image else "layout",
                "properties": {k: raw[k] for k in (BOUNDARY_FIELDS if image else DESIGN_FIELDS) if k in raw}}
        if image:
            found.add(node_id)
            node.update({"name": image.get("name"), "regionId": image["id"], "selector": image.get("selector")})
            contains = True
        else:
            node.update({k: raw[k] for k in ("name", "type") if k in raw})
            children = [visit(c, ancestors + [node_id], i) for i, c in enumerate(raw.get("childNode", []))]
            node["children"] = [c for c, _ in children]
            contains = any(flag for _, flag in children)
        if contains:
            blocked.append(node_id)
        return node, contains

    tree, _ = visit(root, [], 0)
    if found != set(by_id):
        raise ValueError(f"Image nodes outside this frame or hidden by another image: {sorted(set(by_id) - found)}")

    def collect(node):
        if node["nodeId"] not in blocked:
            allowed.append(node["nodeId"])
        else:
            for child in node.get("children", []):
                collect(child)

    collect(tree)
    return {"schemaVersion": 1, "kind": "visual-qa-langgraph-generation-context", "status": "ready",
            "sourceNodeId": root["guid"], "tree": tree, "issues": [],
            "images": [{"regionId": i["id"], "nodeId": i["nodeId"], "selector": i.get("selector"),
                        "sourceRegionId": i["sourceRegionId"], "role": i["role"],
                        "representation": "single-image", "pixsoAccess": "export-only", "hierarchy": hierarchy[i["nodeId"]]} for i in images],
            "codeGeneration": {"allowedNodeIds": allowed, "blockedNodeIds": blocked,
                               "unknownNodePolicy": "deny", "opaqueDescendantPolicy": "deny"},
            "hierarchyPolicy": {"treeIsLayoutAuthority": True, "siblingOrder": "source-childNode-order", "imagesArrayRole": "asset-index-not-layout"}}
