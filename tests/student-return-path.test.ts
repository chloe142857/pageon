import assert from "node:assert/strict";
import test from "node:test";

import { getSafeStudentReturnPath } from "../src/lib/student-return-path.ts";

test("학생 로그인 후에는 학생 또는 QR 제출 화면으로만 돌아간다", () => {
  assert.equal(getSafeStudentReturnPath("/submit/a-safe-token"), "/submit/a-safe-token");
  assert.equal(getSafeStudentReturnPath("/student"), "/student");
  assert.equal(getSafeStudentReturnPath("https://example.com"), "/student");
  assert.equal(getSafeStudentReturnPath("//example.com"), "/student");
});
