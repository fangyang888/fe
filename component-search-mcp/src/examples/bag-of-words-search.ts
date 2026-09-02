#!/usr/bin/env node

import {
  bagOfWords,
  searchByBagOfWords,
} from "../vector-search.js";

// 示例数据归示例所有；生产检索代码不提供静默的默认词表。
const EXAMPLE_VOCABULARY = ["九宫格", "图片", "网格", "排行榜"] as const;

const components = [
  {
    id: "NineGrid",
    text: "九宫格 图片 网格，展示九张照片",
  },
  {
    id: "SwiperSlide3",
    text: "排行榜第三页，展示宝宝排行信息",
  },
  {
    id: "TemplateGrid",
    text: "模板网格，展示多个拼图模板",
  },
];

const query = "九宫格图片组件";
const results = searchByBagOfWords(query, components, {
  vocabulary: EXAMPLE_VOCABULARY,
  limit: 3,
});

console.log("词表：", EXAMPLE_VOCABULARY);
console.log("查询：", query);
console.log("查询向量：", bagOfWords(query, EXAMPLE_VOCABULARY));
console.table(
  results.map(({ item, score }) => ({
    id: item.id,
    vector: JSON.stringify(bagOfWords(item.text, EXAMPLE_VOCABULARY)),
    score: Number(score.toFixed(4)),
  })),
);
