import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatComponentSearchResult,
  toDisplayRelativePath,
} from "../src/search-result-format.js";
import type { ComponentSearchResult } from "../src/types.js";

test("formats the fields users need to evaluate a component", () => {
  const result: ComponentSearchResult = {
    query: "手机号输入",
    projectRoot: "/workspace/demo",
    projectName: "demo",
    sourceRoots: ["src"],
    total: 1,
    results: [
      {
        id: "demo:src/PhoneInput.tsx#PhoneInput",
        name: "PhoneInput",
        description: "手机号输入框",
        scope: "project",
        framework: "react",
        parser: "typescript-ast",
        projectName: "demo",
        sourcePath: "src/PhoneInput.tsx",
        exportPath: "./src/PhoneInput",
        exportKind: "named",
        status: "stable",
        keywords: [],
        useCases: [],
        props: [
          {
            name: "value",
            type: "string",
            required: false,
            description: "当前号码",
          },
          { name: "onChange", type: "(value: string) => void", required: true },
        ],
        imports: [],
        hooks: [],
        renderedElements: ["input"],
        sourceSnippet: "",
        embeddingText: "",
        usageCount: 1,
        usedBy: ["src/Profile.tsx"],
        score: 121,
        matchScore: 0.87,
        matchReason: ["描述匹配：手机号"],
        importExample: 'import { PhoneInput } from "./src/PhoneInput";',
      },
    ],
  };

  const text = formatComponentSearchResult(result);

  assert.match(text, /描述：手机号输入框/);
  assert.match(
    text,
    /PhoneInput.*使用次数：1 次/,
  );
  assert.match(
    text,
    /组件路径：\[\/src\/PhoneInput\.tsx\]\(<\/workspace\/demo\/src\/PhoneInput\.tsx>\)/,
  );
  assert.doesNotMatch(text, /实际绝对路径：|相对路径：/);
  assert.doesNotMatch(text, /\[PhoneInput\]\(/);
  assert.match(text, /最终回答不得省略/);
  assert.match(text, /导入：import \{ PhoneInput \}/);
  assert.doesNotMatch(text, /匹配度|匹配原因|排序原始分/);
  assert.match(text, /使用位置：src\/Profile\.tsx/);
  assert.match(text, /value\?: string — 当前号码/);
  assert.match(text, /onChange: \(value: string\) => void/);
});

test("removes a workspace container directory from the display-relative path", () => {
  assert.equal(
    toDisplayRelativePath("modules/puzzle/src/components/PreviewModal.tsx"),
    "/puzzle/src/components/PreviewModal.tsx",
  );
  assert.equal(
    toDisplayRelativePath("packages/ui/src/GridMenu.vue"),
    "/ui/src/GridMenu.vue",
  );
});
