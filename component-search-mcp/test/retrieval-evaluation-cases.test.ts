import assert from "node:assert/strict";
import { test } from "node:test";
import { RETRIEVAL_EVALUATION_CASES } from "../src/examples/retrieval-evaluation-cases.js";

test("evaluation cases have unique ids and cover every comparison category", () => {
  assert.equal(RETRIEVAL_EVALUATION_CASES.length, 24);
  assert.equal(
    new Set(RETRIEVAL_EVALUATION_CASES.map(({ id }) => id)).size,
    RETRIEVAL_EVALUATION_CASES.length,
  );
  assert.deepEqual(
    Object.fromEntries(
      ["semantic", "exact", "hard"].map((category) => [
        category,
        RETRIEVAL_EVALUATION_CASES.filter((item) => item.category === category)
          .length,
      ]),
    ),
    { semantic: 12, exact: 6, hard: 6 },
  );
  assert.deepEqual(
    [...new Set(RETRIEVAL_EVALUATION_CASES.map(({ expected }) => expected))].sort(),
    ["DataTable", "PhoneInput", "UserSelectModal"],
  );
});
