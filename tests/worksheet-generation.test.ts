import assert from "node:assert/strict";
import test from "node:test";

import standardsSource from "../achievement_standards_math.json" with { type: "json" };
import { gradeBandFor, lessonsFor, mathAreas, relatedStandards, suggestedArea } from "../src/lib/lesson-contents.ts";
import { generateWorksheetQuestions, generationCategories, generationTotals, paginateGeneratedQuestions } from "../src/lib/worksheet-generation.ts";

test("영역 목록은 성취기준 JSON과 일치하고 대표 단원이 올바른 영역으로 분류된다", () => {
  assert.deepEqual(new Set(standardsSource.map((item) => item.area)), new Set(mathAreas));
  assert.equal(suggestedArea("나눗셈"), "수와 연산");
  assert.equal(suggestedArea("평면도형"), "도형과 측정");
  assert.equal(suggestedArea("규칙 찾기"), "변화와 관계");
  assert.equal(suggestedArea("막대그래프"), "자료와 가능성");
  assert.equal(suggestedArea("세 자리 수", "각 자리 숫자가 나타내는 값 알아보기"), "수와 연산");
  assert.equal(suggestedArea("곱셈구구", "곱셈표 만들기"), "수와 연산");
  assert.equal(suggestedArea("삼각형", "삼각형을 분류하기"), "도형과 측정");
  assert.equal(suggestedArea("시계 보기와 규칙 찾기", "규칙을 찾기"), "변화와 관계");
});

test("3학년 나눗셈 차시는 해당 학년·영역의 성취기준 후보만 보여준다", () => {
  const unit = lessonsFor(3, "1학기").find((item) => item.unit_name === "나눗셈");
  assert.ok(unit);
  const standards = standardsSource.map((item, index) => ({ ...item, id: String(index) }));
  const candidates = relatedStandards(standards.map((item) => ({ ...item, grade_band: item.grade })), 3, "수와 연산", unit.unit_name, unit.lessons[0].content);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((item) => item.grade_band === gradeBandFor(3) && item.area === "수와 연산"));
});

test("약수와 배수 단원은 두 관련 성취기준을 후보 앞쪽에 표시한다", () => {
  const standards = standardsSource.map((item, index) => ({ ...item, id: String(index), grade_band: item.grade }));
  const top = relatedStandards(standards, 5, "수와 연산", "약수와 배수", "약수와 배수").slice(0, 2).map((item) => item.code);
  assert.deepEqual(new Set(top), new Set(["6수01-04", "6수01-05"]));
});

test("일반 문항은 10문항씩 A4 한 쪽에 배치한다", () => {
  const base = { questionText: "문항", answer: "정답", explanation: "해설", score: 1, page: 1, answerBBox: null };
  const result = paginateGeneratedQuestions([
    ...Array.from({ length: 10 }, () => ({ ...base, type: "short_answer" as const })),
    { ...base, type: "constructed_response" as const },
  ]);
  assert.deepEqual(result.map((item) => item.page), [...Array(10).fill(1), 2]);
});

test("Upstage는 선택한 유형 개수와 성취기준으로 문제를 생성한다", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.UPSTAGE_API_KEY;
  process.env.UPSTAGE_API_KEY = "test-key";
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const request = JSON.parse(body.messages[1].content);
    assert.equal(request.grade, 3);
    assert.equal(body.response_format.type, "json_schema");
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions: Array.from({ length: request.count }, (_, index) => ({ question_text: `12 ÷ ${index + 1}의 몫을 구하세요.`, answer: "12", explanation: "12를 나눕니다." })) }) } }] }), { status: 200 });
  };
  try {
    const result = await generateWorksheetQuestions({
      grade: 3, semester: "1학기", unitName: "나눗셈", lessonObjective: "나눗셈 알아보기", area: "수와 연산", total: 2,
      counts: { short_answer: 0, multiple_choice: 0, constructed_response: 0, calculation: 1, word_problem: 1 },
      standards: [{ id: "standard-id", code: "4수01-01", description: "나눗셈을 이해한다." }],
    });
    assert.equal(result.questions.length, 2);
    assert.deepEqual(result.questions.map((item) => item.category), ["calculation", "word_problem"]);
    assert.deepEqual(result.questions.map((item) => item.type), ["calculation", "short_answer"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.UPSTAGE_API_KEY; else process.env.UPSTAGE_API_KEY = originalKey;
  }
});

test("10·20·30문항 설정은 요청한 수만큼 생성하고 A4 페이지로 나뉜다", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.UPSTAGE_API_KEY;
  process.env.UPSTAGE_API_KEY = "test-key";
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions: Array.from({ length: request.count }, (_, index) => ({ question_text: `${request.question_category} ${request.batch_number}-${index + 1}의 답을 구하세요.`, answer: "1", explanation: "계산합니다." })) }) } }] }), { status: 200 });
  };
  try {
    for (const total of generationTotals) {
      const counts = Object.fromEntries(generationCategories.map((category, index) => [category, Math.floor(total / 5) + (index < total % 5 ? 1 : 0)])) as Record<(typeof generationCategories)[number], number>;
      const result = await generateWorksheetQuestions({ grade: 3, semester: "1학기", unitName: "나눗셈", lessonObjective: "나눗셈 알아보기", area: "수와 연산", total, counts, standards: [{ id: "standard-id", code: "4수01-01", description: "나눗셈을 이해한다." }] });
      assert.equal(result.questions.length, total);
      assert.ok(result.questions.every((item) => item.page >= 1 && item.page <= 30));
      assert.equal(Math.max(...result.questions.map((item) => item.page)), Math.ceil(total / 10));
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.UPSTAGE_API_KEY; else process.env.UPSTAGE_API_KEY = originalKey;
  }
});

test("성취기준을 선택하지 않아도 생성할 수 있다", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.UPSTAGE_API_KEY;
  process.env.UPSTAGE_API_KEY = "test-key";
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const request = JSON.parse(body.messages[1].content);
    assert.deepEqual(request.standards, []);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions: [{ question_text: "12 ÷ 3을 계산하세요.", answer: "4", explanation: "3 × 4 = 12" }] }) } }] }), { status: 200 });
  };
  try {
    const result = await generateWorksheetQuestions({ grade: 3, semester: "1학기", unitName: "나눗셈", lessonObjective: "몫 구하기", area: "수와 연산", total: 1, counts: { short_answer: 0, multiple_choice: 0, constructed_response: 0, calculation: 1, word_problem: 0 }, standards: [] });
    assert.equal(result.questions.length, 1);
    assert.equal(result.questions[0].page, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.UPSTAGE_API_KEY; else process.env.UPSTAGE_API_KEY = originalKey;
  }
});
