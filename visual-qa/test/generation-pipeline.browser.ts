import assert from "node:assert/strict";
import { test } from "node:test";
import { PNG } from "pngjs";
import { launchVisualQaBrowser } from "../src/capture.js";
import { createGenerationContext } from "../src/generation-context.js";
import { generateScaffold } from "../src/generate-scaffold.js";
import type { IntentPlan } from "../src/types.js";

test("generated draft renders nested image dimensions, rem typography and escaped text in Chrome", async () => {
  const plan: IntentPlan = { kind: "visual-qa-intent-plan", schemaVersion: 1, status: "ready", name: "render", generatedAt: "", ambiguities: [],
    source: { provider: "pixso", nodeId: "frame" }, regions: [{ id: "hero", name: "hero", order: 0, nodeId: "image", mode: "single-image", selector: "#hero", confidence: 1, borderWidth: 0 }] };
  const context = createGenerationContext(plan, { guid: "frame", layoutMode: "VERTICAL", childNode: [
    { guid: "card", layoutMode: "VERTICAL", width: 300, itemSpacing: 10, childNode: [
      { guid: "image", width: 300, height: 120 },
      { guid: "text", nodeText: "<script>not executable</script>", fontSize: 16 },
    ] },
  ] });
  const draft = generateScaffold(context, { unit: "rem", rootFontSize: 10, assets: { image: { src: "./hero.png", alt: "" } } });
  const png = PNG.sync.write(new PNG({ width: 300, height: 120 }));
  const browser = await launchVisualQaBrowser("chrome");
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.route("http://vqa.test/hero.png", (route) => route.fulfill({ contentType: "image/png", body: png }));
    await page.setContent(`<base href="http://vqa.test/"><style>html {font-size:10px} body {margin:0}${draft.css}</style>${draft.html}`);
    await page.locator("#hero").evaluate((image) => (image as HTMLImageElement).decode());
    const observed = await page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>("#hero")!;
      const label = document.querySelector<HTMLElement>("[data-vqa-node='text']")!;
      return { width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height,
        parent: img.parentElement!.getAttribute("data-vqa-node"), fontSize: getComputedStyle(label).fontSize,
        margin: getComputedStyle(label).marginTop, text: label.textContent, scripts: document.scripts.length, loaded: img.naturalWidth };
    });
    assert.deepEqual(observed, { width: 300, height: 120, parent: "card", fontSize: "16px", margin: "10px", text: "<script>not executable</script>", scripts: 0, loaded: 300 });
  } finally { await browser.close(); }
});
