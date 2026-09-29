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

test("서술형 채점은 Upstage Chat Completions와 구조화된 JSON을 사용한다", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.UPSTAGE_API_KEY;
  const originalModel = process.env.UPSTAGE_GRADING_MODEL;
  const originalBaseUrl = process.env.UPSTAGE_API_BASE_URL;
  process.env.UPSTAGE_API_KEY = "test-key";
  process.env.UPSTAGE_GRADING_MODEL = "solar-pro4";
  process.env.UPSTAGE_API_BASE_URL = "https://api.upstage.ai/v1";
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.upstage.ai/v1/chat/completions");
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.model, "solar-pro4");
    assert.equal(payload.response_format.type, "json_schema");
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ predicted_result: "correct", confidence: 0.91, reasoning_summary: "설명이 정답과 일치합니다.", needs_teacher_review: false }) } }] }), { status: 200 });
  };

  try {
    const result = await gradeAnswer({ type: "constructed_response", questionText: "12 ÷ 3의 방법을 설명하세요.", expectedAnswer: "12를 3개씩 묶으면 4묶음", explanation: "3개씩 묶어 몫을 구한다.", recognizedText: "12를 3개씩 묶으면 4묶음입니다.", recognitionConfidence: 96, recognitionError: null });
    assert.equal(result.predictedResult, "correct");
    assert.equal(result.gradingStatus, "AUTO_CONFIRMED");
    assert.equal(result.modelName, "solar-pro4");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.UPSTAGE_API_KEY; else process.env.UPSTAGE_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.UPSTAGE_GRADING_MODEL; else process.env.UPSTAGE_GRADING_MODEL = originalModel;
    if (originalBaseUrl === undefined) delete process.env.UPSTAGE_API_BASE_URL; else process.env.UPSTAGE_API_BASE_URL = originalBaseUrl;
  }
});

test("기본 Upstage 모델이 제한 오류면 다음 모델로 재시도한다", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.UPSTAGE_API_KEY;
  const originalModel = process.env.UPSTAGE_GRADING_MODEL;
  const originalFallbackModels = process.env.UPSTAGE_GRADING_FALLBACK_MODELS;
  process.env.UPSTAGE_API_KEY = "test-key";
  process.env.UPSTAGE_GRADING_MODEL = "solar-pro4";
  process.env.UPSTAGE_GRADING_FALLBACK_MODELS = "solar-pro3";
  const requestedModels: string[] = [];
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(String(init?.body));
    requestedModels.push(payload.model);
    if (payload.model === "solar-pro4") return new Response("too many requests", { status: 429 });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ predicted_result: "partial", confidence: 0.75, reasoning_summary: "일부 설명이 맞습니다.", needs_teacher_review: true }) } }] }), { status: 200 });
  };

  try {
    const result = await gradeAnswer({ type: "constructed_response", questionText: "설명하세요.", expectedAnswer: "정답", explanation: "해설", recognizedText: "학생 답", recognitionConfidence: 96, recognitionError: null });
    assert.deepEqual(requestedModels, ["solar-pro4", "solar-pro3"]);
    assert.equal(result.modelName, "solar-pro3");
    assert.equal(result.gradingStatus, "REVIEW_REQUIRED");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.UPSTAGE_API_KEY; else process.env.UPSTAGE_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.UPSTAGE_GRADING_MODEL; else process.env.UPSTAGE_GRADING_MODEL = originalModel;
    if (originalFallbackModels === undefined) delete process.env.UPSTAGE_GRADING_FALLBACK_MODELS; else process.env.UPSTAGE_GRADING_FALLBACK_MODELS = originalFallbackModels;
  }
});
