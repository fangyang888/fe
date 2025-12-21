import { diffLines, diffWords } from "diff";

/* ===== 实时字数 / 行数 ===== */
export function getDocStat(text: string) {
  const lines = text.split("\n").length;

  // 中英文通用：英文按词，中文≈字
  const words = text.replace(/\n/g, " ").split(/\s+/).filter(Boolean).length;

  return { lines, words };
}

/* ===== 修改统计（相对基线） ===== */
export function getChangeStat(base: string, current: string) {
  const lineDiff = diffLines(base, current);
  const wordDiff = diffWords(base, current);

  let addedLines = 0;
  let removedLines = 0;
  let addedWords = 0;
  let removedWords = 0;

  lineDiff.forEach((p) => {
    if (p.added) addedLines += p.count ?? 0;
    if (p.removed) removedLines += p.count ?? 0;
  });

  wordDiff.forEach((p) => {
    const count = p.value.trim().split(/\s+/).filter(Boolean).length;

    if (p.added) addedWords += count;
    if (p.removed) removedWords += count;
  });

  return {
    addedLines,
    removedLines,
    changedLines: addedLines + removedLines,
    addedWords,
    removedWords,
  };
}
