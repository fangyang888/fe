import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bagOfWords,
  cosineSimilarity,
  searchByBagOfWords,
} from "../src/vector-search.js";

const vocabulary = ["九宫格", "图片", "网格", "排行榜"] as const;

test("calculates cosine similarity for two three-dimensional vectors", () => {
  const similarity = cosineSimilarity([1, 2, 3], [2, 1, 0]);

  assert.ok(Math.abs(similarity - 4 / Math.sqrt(70)) < 1e-12);
});

test("rejects vectors with different dimensions", () => {
  assert.throws(
    () => cosineSimilarity([1, 2], [1, 2, 3]),
    /Vector dimensions differ: 2 !== 3/,
  );
});

test("returns zero when either input is a zero vector", () => {
  assert.equal(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0);
  assert.equal(cosineSimilarity([], []), 0);
});

test("creates count vectors in vocabulary order", () => {
  assert.deepEqual(bagOfWords("九宫格图片图片组件", vocabulary), [1, 2, 0, 0]);
  assert.deepEqual(bagOfWords("a+b and a+b", ["a+b", "and"]), [2, 1]);
});

test("ranks the bag-of-words example and keeps its input immutable", () => {
  const components = [
    { id: "NineGrid", text: "九宫格 图片 网格，展示九张照片" },
    { id: "SwiperSlide3", text: "排行榜第三页，展示宝宝排行信息" },
    { id: "TemplateGrid", text: "模板网格，展示多个拼图模板" },
  ];
  const originalOrder = components.map(({ id }) => id);

  const results = searchByBagOfWords("九宫格图片组件", components, {
    vocabulary,
    limit: 2,
  });

  assert.deepEqual(
    results.map(({ item }) => item.id),
    ["NineGrid", "SwiperSlide3"],
  );
  assert.ok(Math.abs((results[0]?.score ?? 0) - 2 / Math.sqrt(6)) < 1e-12);
  assert.equal(results[1]?.score, 0);
  assert.deepEqual(components.map(({ id }) => id), originalOrder);
});
