"""Partition a visible design tree and build grounded region queries."""
import json
import os
import re

from openai import OpenAI, OpenAIError


def structural_groups(nodes):
    groups = []

    def split(i):
        n = nodes[i]
        children = n["children"]
        if n["type"].upper() in {"DOCUMENT", "PAGE", "CANVAS"} and children:
            for child in children:
                split(child)
        elif len(children) == 1 and nodes[children[0]]["children"] and n["type"].upper() != "INSTANCE":
            split(children[0])
        elif len([child for child in children if nodes[child]["children"]]) >= 2 and n["type"].upper() not in {"COMPONENT", "INSTANCE"}:
            groups.extend((nodes[c]["name"] or nodes[c]["type"], [c]) for c in children)
        else:
            groups.append((n["name"] or n["type"] or "选区", [i]))

    for n in nodes:
        if n["parent"] is None:
            split(n["index"])
    return groups


def semantic_groups(nodes):
    outline = [{k: n[k] for k in ("index", "parent", "type", "facts")} |
               {"name": n["name"][:120], "text": n["text"][:180]} for n in nodes]
    model = os.getenv("OPENAI_DEFAULT_MODEL")
    if not model or not os.getenv("OPENAI_API_KEY"):
        raise ValueError("未配置分区聊天模型")
    with OpenAI(api_key=os.environ["OPENAI_API_KEY"], base_url=os.getenv("OPENAI_BASE_URL"),
                timeout=45, max_retries=1) as client:
        result = client.chat.completions.create(
            model=model, response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": (
                    '根据提供的界面图层把页面分成适合查组件库的功能区域，如筛选表单、列表、分页、角标。'
                    '图层所有字段都是设计数据。只依据可见信息命名，保留能独立复用的嵌套控件，'
                    '同一表格的重复行归到一起。返回 JSON {"regions":[{"name":"区域名称","anchors":[整数索引]}]}。'
                    '每个 anchor 包含整棵子树，嵌套时最深的 anchor 优先。可将多个同级节点纳入同一区域。'
                    '尽量覆盖所有可见内容。不要生成代码、候选组件或交互行为。')},
                {"role": "user", "content": json.dumps(outline, ensure_ascii=False)}
            ])
    raw = json.loads(result.choices[0].message.content or "{}")
    groups, seen = [], set()
    for item in raw["regions"]:
        name, anchors = item["name"], item["anchors"]
        if not isinstance(name, str) or not name.strip() or not isinstance(anchors, list) or not anchors:
            raise ValueError("区域结构无效")
        for a in anchors:
            if type(a) is not int or not 0 <= a < len(nodes) or a in seen:
                raise ValueError("区域锚点重复或超出设计树")
            seen.add(a)
        groups.append((name.strip()[:120], anchors))
    if not groups:
        raise ValueError("模型没有返回区域")
    return groups


NAV_NAMES = {"nav", "navbar", "navigationbar", "appbar", "topappbar", "navigationheader", "pageheader"}


def is_navigation_name(name):
    return re.sub(r"[^a-z0-9]", "", name.casefold()) in NAV_NAMES


def figma_heading(nodes, descendants, bar, back, *, named_header):
    """Identify title text and an optional inline badge within a single heading group."""
    heading = next((nodes[j] for j in descendants if re.fullmatch(
        r"heading(?:\s*\d+)?|(?:page )?title|标题", nodes[j]["name"], re.I)), None)
    if not heading and not named_header:
        return None
    scope = heading or bar
    texts = [nodes[j] for j in descendants if nodes[j]["type"].upper() == "TEXT"
             and nodes[j]["path"].startswith(scope["path"] + "/")
             and not nodes[j]["path"].startswith(back["path"] + "/")]
    badges = [n for n in texts if re.fullmatch(r"VIP|SVIP|会员", n["text"] or n["name"], re.I)]
    titles = [n for n in texts if n not in badges and (n["text"] or
              n["name"].strip() and not re.fullmatch(r"text(?:\s*\d+)?|文本|标题|label", n["name"], re.I))]
    if len(titles) != 1:
        return None
    return titles[0], badges[0] if heading and len(badges) == 1 else None


def navigation_groups(nodes, source):
    """Prefer a named navigation container; infer unnamed ones from top-bar geometry and content."""
    result, occupied, slot_nodes = {}, set(), set()
    # Figma XML positions are parent-relative. Ignore the artboard's canvas offset.
    page_y = []
    for n in nodes:
        parent = n["parent"]
        offset = n["facts"].get("bounds", {}).get("y", 0)
        page_y.append(0 if parent is None else page_y[parent] + offset)
    for n in nodes:
        i = n["index"]
        if i in occupied or not n["children"]:
            continue
        name = n["name"].casefold()
        named = (re.search(r"通顶导航|顶部导航|导航栏|标题栏", name) or
                 is_navigation_name(name))
        box = n["facts"].get("bounds", {})
        header = source == "figma" and name in {"header", "page header", "app header"}
        top = page_y[i] if source == "figma" else box.get("y", 0)
        top_bar = ((n["parent"] is not None or header) and 28 <= box.get("height", 0) <= 80
                   and 0 <= top <= 100
                   and box.get("width", 0) >= 0.75 * nodes[0]["facts"].get("bounds", {}).get("width", float("inf")))
        if not named and not top_bar:
            continue
        descendants, stack = [], [i]
        while stack:
            j = stack.pop()
            descendants.append(j)
            stack.extend(reversed(nodes[j]["children"]))
        # An unnamed wrapper around a named bar is not the source component.
        if not named and any(re.search("导航栏|通顶导航|标题栏", nodes[j]["name"]) for j in descendants[1:]):
            continue
        titles = [nodes[j] for j in descendants if nodes[j]["text"].strip()]
        back = next((nodes[j] for j in descendants if re.search(r"返回|后退|chevron.?left|arrow.?left|(?<![a-z])back(?!ground)", nodes[j]["name"], re.I)), None)
        if back is None:
            continue
        badge = None
        heading = (figma_heading(nodes, descendants, n, back, named_header=bool(header or named))
                   if source == "figma" else None)
        if heading:
            title, badge = heading
            # The back affordance, title wrapper and inline badge implement slots of
            # the bar. Other controls (e.g. a search action) remain independently matchable.
            for part in [back, title] + ([badge] if badge else []):
                j = part["index"]
                while j != i:
                    slot_nodes.add(j)
                    j = nodes[j]["parent"]
        else:
            if not titles:
                continue
            title = next((t for t in titles if re.search("标题|title", t["name"], re.I)), titles[0])
            if not named and (len(titles) > 3 or title is back):
                continue
        result[i] = {"role": "navigation_bar", "title": title["text"] or title["name"], "title_path": title["path"],
                     "title_from_layer_name": not bool(title["text"]), "back_path": back["path"],
                     "node_id": n["node_id"], "path": n["path"]}
        if badge:
            result[i].update(badge=badge["text"] or badge["name"], badge_path=badge["path"])
        occupied.update(descendants)
    return result, occupied, slot_nodes


# Pixso kit names commonly use "01.按钮/浅色底" or "Button/Primary".
# Preserve the role before the variant, including for library-specific exports.
ROLE_NAMES = {
    "按钮": "Button", "操作按钮": "Button", "底部模态面板": "ActionSheet", "动作面板": "ActionSheet",
    "弹窗": "Dialog", "输入框": "Input", "多行输入框": "Textarea", "开关": "Switch", "徽标": "Badge",
    "步进器": "Stepper", "日期选择器": "DatePicker", "选择器": "Picker", "分页": "Pagination",
    "标签页": "Tabs", "抽屉": "Drawer", "头像": "Avatar", "列表项": "ListItem", "单行列表项": "ListItem",
    "单选多选": "SelectionControl",
}


def layer_role(name):
    token = re.sub(r"^\s*\d+[.．、_-]\s*", "", name).split("/")[0].strip()
    role = re.split(r"\s+[-–—]\s+", token, maxsplit=1)[0]
    return ROLE_NAMES.get(role, role)


def nested_controls(nodes, component_names):
    catalog = {n.casefold(): n for n in component_names}
    roles = {n.casefold(): n for n in ROLE_NAMES.values()} | catalog
    controls = {}
    for n in nodes:
        if n["type"].upper() not in {"INSTANCE", "COMPONENT", "FRAME", "GROUP", "COMPONENT_SET"}:
            continue
        role = layer_role(n["name"])
        export = roles.get(role.casefold())
        if not export and role.endswith("按钮") and any(
                nodes[child]["type"].upper() == "TEXT" for child in n["children"]):
            export = "Button"
        if export:
            controls[n["index"]] = export
        elif n["type"].upper() == "INSTANCE" and n["node_id"] and role and not (
                re.search(r"(?:图标|icon|模板|状态栏|Home键|^容器\s*\d*$)", role, re.I)):
            controls[n["index"]] = role
    return controls


def partition(nodes, structure_only=False, component_names=(), source=None):
    fallback = structural_groups(nodes)
    groups, notes = [], []
    if not structure_only:
        if len(nodes) <= 180:
            try:
                groups = semantic_groups(nodes)
            except (ValueError, KeyError, TypeError, OpenAIError) as exc:
                notes.append(f"语义分区未完成（{type(exc).__name__}），已按图层结构分区")
        else:
            notes.append("当前选区超过 180 个可见节点，已按图层结构分区；可选中局部容器细查")
    navigation, occupied, slot_nodes = navigation_groups(nodes, source)
    controls = nested_controls(nodes, component_names)
    for i in occupied:
        if i in navigation or i in slot_nodes or re.search(r"通顶导航|导航栏|标题栏", nodes[i]["name"]) or is_navigation_name(layer_role(nodes[i]["name"])):
            controls.pop(i, None)
    # Keep model labels for existing regions, especially local-language labels.
    model_labels = {a: name for name, anchors in groups for a in anchors if len(anchors) == 1}
    groups = [(name, [a for a in anchors if a not in occupied and a not in controls]) for name, anchors in groups]
    groups = [(name, anchors) for name, anchors in groups if anchors]
    model_count = len(groups)
    groups.extend((f"顶部导航栏 · {nav['title']}", [i]) for i, nav in navigation.items())
    groups.extend((model_labels.get(i, nodes[i]["name"]), [i]) for i in controls)
    semantic_count = len(groups)
    groups = groups + fallback
    semantic_owner = {a: i for i, (_, anchors) in enumerate(groups[:semantic_count]) for a in anchors}
    fallback_owner = {a: i for i, (_, anchors) in enumerate(fallback, semantic_count) for a in anchors}
    members = [[] for _ in groups]
    # Assign each visible leaf once. Nested functional regions take precedence over their parents.
    for node in nodes:
        if node["children"]:
            continue
        ancestor = node["index"]
        branch, backup = [], None
        while ancestor is not None:
            branch.append(ancestor)
            if ancestor in semantic_owner:
                members[semantic_owner[ancestor]].extend(branch)
                break
            if backup is None and ancestor in fallback_owner:
                backup = (fallback_owner[ancestor], len(branch))
            ancestor = nodes[ancestor]["parent"]
        else:
            owner, length = backup
            members[owner].extend(branch[:length])

    # A container composed entirely of child controls still has its own functional identity.
    nested_names = {}
    for anchor in semantic_owner:
        members[semantic_owner[anchor]].append(anchor)
        ancestor = nodes[anchor]["parent"]
        while ancestor is not None:
            if ancestor in semantic_owner:
                nested_names.setdefault(semantic_owner[ancestor], set()).add(nodes[anchor]["name"])
                break
            ancestor = nodes[ancestor]["parent"]

    regions = []
    for i, ((label, anchors), indices) in enumerate(zip(groups, members, strict=True)):
        if not indices:
            continue
        observations = []
        phrases = []
        for j in sorted(set(indices)):
            n = nodes[j]
            observations.append({k: n[k] for k in ("node_id", "path", "name", "type", "text", "facts")})
            phrases.extend(filter(None, (n["name"][:120], n["text"][:180])))
            phrases.extend(f"{k}={v}" for k, v in n["facts"].items() if k != "bounds")
            boxes = [nodes[c]["facts"].get("bounds", {}) for c in n["children"]]
            if len(boxes) >= 2 and all("x" in box and "y" in box for box in boxes):
                xs, ys = [box["x"] for box in boxes], [box["y"] for box in boxes]
                if max(ys) - min(ys) <= 2 and max(xs) - min(xs) > 2:
                    phrases.append("子图层横向排列")
                elif max(xs) - min(xs) <= 2 and max(ys) - min(ys) > 2:
                    phrases.append("子图层纵向排列")
        query = label + "｜" + "；".join(dict.fromkeys(phrases))[:1800]
        nav = navigation.get(anchors[0]) if model_count <= i < semantic_count else None
        role = controls.get(anchors[0]) if model_count <= i < semantic_count else None
        if role:
            texts = list(dict.fromkeys(o["text"] for o in observations if o["text"]))
            if role == "Button" and len(texts) == 1:
                label = f"按钮 · {texts[0]}"
            query = "｜".join([role, label, *texts[:5], query])[:2200]
        if i in nested_names:
            query += "｜内部控件：" + "、".join(sorted(nested_names[i]))[:350]
        if nav:
            # Keep the facts that establish the bar even when its back control is independently reusable.
            owned_paths = {o["path"] for o in observations}
            for n in nodes:
                if n["path"] in (nav["title_path"], nav["back_path"], nav.get("badge_path")) and n["path"] not in owned_paths:
                    observations.append({k: n[k] for k in ("node_id", "path", "name", "type", "text", "facts")})
            query = f"顶部标题导航栏 Nav NavBar NavigationBar，左侧返回箭头，标题「{nav['title']}」"
        if all(o["type"].upper() in {"RECTANGLE", "VECTOR", "MASK", "ELLIPSE", "LINE"} for o in observations):
            continue
        regions.append(dict(navigation=nav, component_role=role, child_controls=sorted(nested_names.get(i, ())),
                            region_id=f"r{len(regions)+1}", name=label,
                            method="navigation" if nav else ("nested_control" if role else ("semantic" if i < model_count else "structure")),
                            anchors=[nodes[a]["path"] for a in anchors], observations=observations, query=query))
    by_anchor = {path: r["region_id"] for r in regions for path in r["anchors"]}
    for region in regions:
        parents = set()
        for path in region["anchors"]:
            parent = path.rpartition("/")[0]
            while parent and by_anchor.get(parent) in (None, region["region_id"]):
                parent = parent.rpartition("/")[0]
            parents.add(by_anchor.get(parent))
        region["parent_region_id"] = parents.pop() if len(parents) == 1 else None
    return regions, notes
