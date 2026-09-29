import assert from "node:assert/strict";
import test from "node:test";

import { gradeBandFor, lessonsFor } from "../src/lib/lesson-contents.ts";

test("진도표는 학년과 학기에 맞는 단원·차시를 제공한다", () => {
  const units = lessonsFor(3, "1학기");

  assert.equal(units.length, 6);
  assert.ok(units[0].unit_name);
  assert.ok(units[0].lessons[0].content);
  assert.equal(gradeBandFor(1), "1~2학년");
  assert.equal(gradeBandFor(4), "3~4학년");
  assert.equal(gradeBandFor(6), "5~6학년");
});
