import assert from "node:assert/strict";
import test from "node:test";

import {
  classroomInputSchema,
  studentInputSchema,
  studentSignInSchema,
  studentUpdateSchema,
} from "../src/lib/validation.ts";

test("학급과 학생 입력은 유효한 Phase 1 형식만 허용한다", () => {
  assert.equal(classroomInputSchema.safeParse({ name: "3학년 2반", schoolYear: "2026" }).success, true);
  assert.equal(
    studentInputSchema.safeParse({
      displayName: "김하늘",
      studentNumber: "7",
      studentIdentifier: "sky-07",
      pin: "1234",
    }).success,
    true,
  );
});

test("PIN과 학생 식별자의 안전하지 않은 형식을 거절한다", () => {
  assert.equal(
    studentInputSchema.safeParse({
      displayName: "김하늘",
      studentNumber: 7,
      studentIdentifier: "학생 7번",
      pin: "12ab",
    }).success,
    false,
  );
  assert.equal(studentSignInSchema.safeParse({ classroomCode: "ABCD1234", studentIdentifier: "S07", pin: "123" }).success, false);
  assert.equal(
    studentUpdateSchema.safeParse({
      displayName: "김하늘",
      studentNumber: 7,
      studentIdentifier: "S07",
      pin: "",
    }).success,
    true,
  );
});
