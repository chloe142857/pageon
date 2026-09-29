import assert from "node:assert/strict";
import test from "node:test";

import {
  classroomInputSchema,
  studentInputSchema,
  studentSignInSchema,
  studentUpdateSchema,
} from "../src/lib/validation.ts";

test("학급과 학생 입력은 간단한 학급 코드와 번호·이름 로그인 형식만 허용한다", () => {
  assert.equal(classroomInputSchema.safeParse({ name: "3학년 1반", schoolYear: "2026", joinCode: "WKG301" }).success, true);
  assert.equal(
    studentInputSchema.safeParse({
      displayName: "김하늘",
      studentNumber: "7",
      pin: "1234",
    }).success,
    true,
  );
});

test("PIN과 로그인 입력의 안전하지 않은 형식을 거절한다", () => {
  assert.equal(
    studentInputSchema.safeParse({
      displayName: "김하늘",
      studentNumber: 7,
      pin: "12ab",
    }).success,
    false,
  );
  assert.equal(studentSignInSchema.safeParse({ classroomCode: "ABC", studentNumber: 0, displayName: "", pin: "123" }).success, false);
  assert.equal(
    studentUpdateSchema.safeParse({
      displayName: "김하늘",
      studentNumber: 7,
      pin: "",
    }).success,
    true,
  );
});
