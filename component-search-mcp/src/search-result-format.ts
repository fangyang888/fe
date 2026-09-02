import path from "node:path";
import type { ComponentSearchMatch, ComponentSearchResult } from "./types.js";

const WORKSPACE_CONTAINER_DIRECTORIES = new Set(["apps", "modules", "packages"]);

export function toDisplayRelativePath(sourcePath: string): string {
  const segments = sourcePath
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .split("/")
    .filter(Boolean);
  if (segments[0] && WORKSPACE_CONTAINER_DIRECTORIES.has(segments[0])) {
    segments.shift();
  }
  return `/${segments.join("/")}`;
}

function formatProps(component: ComponentSearchMatch): string[] {
  if (component.props.length === 0) return ["     - 无显式 Props"];

  const visibleProps = component.props.slice(0, 12).map((prop) => {
    const signature = `${prop.name}${prop.required ? "" : "?"}: ${prop.type}`;
    return `     - ${signature}${prop.description ? ` — ${prop.description}` : ""}`;
  });
  if (component.props.length > visibleProps.length) {
    visibleProps.push(
      `     - 其余 ${component.props.length - visibleProps.length} 个 Props 请查看源码`,
    );
  }
  return visibleProps;
}

export function formatComponentSearchResult(result: ComponentSearchResult): string {
  if (result.results.length === 0) {
    return "没有找到匹配的项目组件。可以尝试组件名、业务用途或 Props 关键词。";
  }

  return [
    `找到 ${result.results.length} 个组件（项目：${result.projectName}）：`,
    "展示规则：每个候选的【组件路径】和【使用次数】是必要结果，最终回答不得省略。",
    ...result.results.flatMap((component, position) => [
      "",
      `${position + 1}. ${component.name}（${component.framework} / ${component.status}）｜使用次数：${component.usageCount} 次`,
      `   描述：${component.description || "无描述"}`,
      `   组件路径：[${toDisplayRelativePath(component.sourcePath)}](<${path.resolve(result.projectRoot, component.sourcePath)}>)`,
      `   导入：${component.importExample}`,
      `   使用位置：${component.usedBy.length ? component.usedBy.join("；") : "暂无调用记录"}`,
      "   Props：",
      ...formatProps(component),
    ]),
  ].join("\n");
}
