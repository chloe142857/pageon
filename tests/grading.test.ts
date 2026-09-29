import assert from "node:assert/strict";
import test from "node:test";

import { gradeAnswer, normalizeAnswer } from "../src/lib/grading.ts";

test("답안 비교용 정규화는 공백·기호·동치 분수를 정리한다", () => {
  assert.equal(normalizeAnswer(" 6 / 8 "), "3/4");
  assert.equal(normalizeAnswer("4.0"), "4");
  assert.equal(normalizeAnswer("( ② )"), "2");
});

test("고신뢰도 객관식 일치는 자동 확정된다", async () => {
  const result = await gradeAnswer({
    type: "multiple_choice",
    questionText: "정답을 고르세요.",
    expectedAnswer: "②",
    explanation: "둘째 선택지입니다.",
    recognizedText: "2",
    recognitionConfidence: 96,
    recognitionError: null,
  });

  assert.equal(result.predictedResult, "correct");
  assert.equal(result.gradingStatus, "AUTO_CONFIRMED");
  assert.equal(result.needsTeacherReview, false);
  assert.equal(result.gradingStrategy, "exact");
});

test("저신뢰도 계산 답안은 정규화 비교 후에도 교사 검토로 보낸다", async () => {
  const result = await gradeAnswer({
    type: "calculation",
    questionText: "6/8을 약분하세요.",
    expectedAnswer: "3/4",
    explanation: "분자와 분모를 2로 나눕니다.",
    recognizedText: "6 / 8",
    recognitionConfidence: 52,
    recognitionError: null,
  });

  assert.equal(result.predictedResult, "correct");
  assert.equal(result.gradingStatus, "REVIEW_REQUIRED");
  assert.equal(result.needsTeacherReview, true);
  assert.equal(result.gradingStrategy, "normalized");
});

test("OCR 결과가 없으면 읽을 수 없음으로 검토를 요청한다", async () => {
  const result = await gradeAnswer({
    type: "short_answer",
    questionText: "답을 쓰세요.",
    expectedAnswer: "12",
    explanation: "계산 결과입니다.",
    recognizedText: null,
    recognitionConfidence: null,
    recognitionError: "OCR 실패",
  });

  assert.equal(result.predictedResult, "unreadable");
  assert.equal(result.gradingStatus, "REVIEW_REQUIRED");
});
