import type {
  ComponentIndex,
  ComponentMetadata,
  ComponentSearchMatch,
  ComponentSearchResult,
  SearchOptions,
} from "./types.js";

const STOP_WORDS = new Set([
  "a",
  "an",
  "component",
  "current",
  "find",
  "for",
  "in",
  "project",
  "the",
  "一个",
  "可以",
  "当前",
  "支持",
  "有没有",
  "查找",
  "组件",
  "项目",
  "需要",
]);

const SYNONYMS: Record<string, string[]> = {
  人员: ["user", "person", "member", "employee", "用户", "成员", "员工"],
  用户: ["user", "person", "member", "人员", "成员"],
  选择: ["select", "selector", "picker", "选择器"],
  选择器: ["select", "selector", "picker", "选择"],
  弹窗: ["modal", "dialog", "popup", "弹框"],
  弹框: ["modal", "dialog", "popup", "弹窗"],
  表格: ["table", "grid", "datatable"],
  上传: ["upload", "uploader", "file"],
  搜索: ["search", "query", "filter"],
  远程: ["remote", "request", "async"],
  多选: ["multiple", "multi", "multiselect"],
  日期: ["date", "calendar", "datepicker"],
  表单: ["form", "field", "input"],
  按钮: ["button", "action"],
  菜单: ["menu", "navigation", "nav"],
  分页: ["pagination", "pager", "page"],
  布局: ["layout", "container", "shell"],
  权限: ["auth", "permission", "guard", "access"],
  登录: ["login", "signin", "auth"],
  手机号: ["phone", "mobile", "telephone", "tel", "手机号"],
  电话: ["phone", "mobile", "telephone", "tel", "电话"],
  输入: ["input", "field", "textbox", "输入框"],
  输入框: ["input", "field", "textbox", "输入"],
};

function normalize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[_/\\.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandQuery(query: string): string[] {
  const normalized = normalize(query);
  const terms = new Set<string>(
    normalized
      .match(/[\p{Script=Han}]+|[a-z0-9]+/gu)
      ?.filter((term) => !STOP_WORDS.has(term)) ?? [],
  );

  for (const [key, values] of Object.entries(SYNONYMS)) {
    if (normalized.includes(key) || values.some((value) => normalized.includes(value))) {
      terms.add(key);
      values.forEach((value) => terms.add(value));
    }
  }

  return [...terms];
}

function includesTerm(value: string, term: string): boolean {
  return normalize(value).includes(normalize(term));
}

function scoreComponent(
  component: ComponentMetadata,
  query: string,
  terms: string[],
): ComponentSearchMatch | null {
  const reasons = new Set<string>();
  let score = 0;
  const normalizedName = normalize(component.name);
  const normalizedQuery = normalize(query);

  if (normalizedName === normalizedQuery) {
    score += 120;
    reasons.add("组件名称完全匹配");
  } else if (normalizedName.includes(normalizedQuery) && normalizedQuery.length > 1) {
    score += 60;
    reasons.add("组件名称包含查询内容");
  }

  for (const term of terms) {
    if (includesTerm(component.name, term)) {
      score += 30;
      reasons.add(`名称匹配：${term}`);
    }
    if (component.keywords.some((keyword) => includesTerm(keyword, term))) {
      score += 18;
      reasons.add(`关键词匹配：${term}`);
    }
    if (includesTerm(component.description, term)) {
      score += 15;
      reasons.add(`描述匹配：${term}`);
    }
    if (component.useCases.some((useCase) => includesTerm(useCase, term))) {
      score += 24;
      reasons.add(`使用场景匹配：${term}`);
    }
    if (
      component.props.some(
        (prop) => includesTerm(prop.name, term) || includesTerm(prop.type, term),
      )
    ) {
      score += 12;
      reasons.add(`Props 匹配：${term}`);
    }
    if (includesTerm(component.sourcePath, term)) {
      score += 6;
      reasons.add(`源码路径匹配：${term}`);
    }
  }

  if (score === 0) {
    return null;
  }

  if (component.usageCount > 0) {
    score += Math.min(component.usageCount, 10);
    reasons.add(`当前项目已使用 ${component.usageCount} 次`);
  }

  if (/(^|\/)components?\//i.test(component.sourcePath)) {
    score += 20;
    reasons.add("位于项目组件目录");
  }

  if (component.status === "deprecated") {
    score -= 100;
  }

  return {
    ...component,
    score,
    matchScore: Number((1 - Math.exp(-Math.max(score, 0) / 60)).toFixed(2)),
    matchReason: [...reasons].slice(0, 6),
    importExample:
      component.exportKind === "default"
        ? `import ${component.name} from "${component.exportPath}";`
        : `import { ${component.name} } from "${component.exportPath}";`,
  };
}

export function searchComponents(
  index: ComponentIndex,
  query: string,
  options: SearchOptions = {},
): ComponentSearchResult {
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);
  const terms = expandQuery(query);
  const results = index.components
    .filter((component) => options.includeDeprecated || component.status !== "deprecated")
    .map((component) => scoreComponent(component, query, terms))
    .filter((component): component is ComponentSearchMatch => component !== null)
    .sort(
      (left, right) =>
        right.score - left.score || right.usageCount - left.usageCount,
    );

  return {
    query,
    projectRoot: index.projectRoot,
    projectName: index.projectName,
    sourceRoots: index.sourceRoots,
    total: results.length,
    results: results.slice(0, limit),
  };
}
