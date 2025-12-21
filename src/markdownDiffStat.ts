import { diffChars } from "diff";

export function getChangeStat2(oldText: string, newText: string) {
  const diff = diffChars(oldText, newText);

  let added = 0;
  let removed = 0;
  let hunks = 0;

  diff.forEach((part) => {
    if (part.added) {
      added += part.value.length;
      hunks++;
    } else if (part.removed) {
      removed += part.value.length;
      hunks++;
    }
  });
  console.log("--added--", added);
  return { added, removed, hunks };
}
