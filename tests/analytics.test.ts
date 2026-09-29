import assert from "node:assert/strict";
import test from "node:test";

import { calculateAnalytics, performanceLevel } from "../src/lib/analytics.ts";

const input = {
  students: [
    { id: "student-a", classroomId: "class-a", displayName: "가람", studentNumber: 1, active: true },
    { id: "student-b", classroomId: "class-a", displayName: "나래", studentNumber: 2, active: true },
  ],
  worksheets: [{ id: "worksheet-a", title: "나눗셈", gradeBand: "3~4학년", semester: "1학기", area: "수와 연산", unitName: "나눗셈", standardIds: ["standard-a"] }],
  questions: [
    { id: "question-a", worksheetId: "worksheet-a", questionNumber: 1, questionText: "8 ÷ 2", score: 2 },
    { id: "question-b", worksheetId: "worksheet-a", questionNumber: 2, questionText: "설명", score: 2 },
  ],
  submissions: [
    { id: "old", worksheetId: "worksheet-a", studentId: "student-a", submittedAt: "2026-01-01T00:00:00.000Z" },
    { id: "new", worksheetId: "worksheet-a", studentId: "student-a", submittedAt: "2026-01-02T00:00:00.000Z" },
  ],
  answers: [
    { submissionId: "old", questionId: "question-a", result: "incorrect" as const, scoreAwarded: 0, source: "auto" as const },
    { submissionId: "new", questionId: "question-a", result: "correct" as const, scoreAwarded: 2, source: "teacher" as const },
    { submissionId: "new", questionId: "question-b", result: "partial" as const, scoreAwarded: 1, source: "teacher" as const },
  ],
  standards: [{ id: "standard-a", code: "4수01-01", description: "나눗셈" }],
  classroomId: "class-a",
  worksheetId: "worksheet-a",
};

test("활동지 분석은 학생별 최신 제출만 사용하고 미제출을 계산한다", () => {
  const result = calculateAnalytics(input);
  const activity = result.activitySummaries[0];
  assert.equal(activity.submittedCount, 1);
  assert.equal(activity.classMean, 75);
  assert.equal(activity.median, 75);
  assert.equal(activity.missingStudents?.map((student) => student.id).join(","), "student-b");
  assert.equal(result.questionMetrics[0].question.id, "question-b");
});

test("성취기준은 활동지 전체의 모든 문항 결과와 연결되며 선택하지 않으면 분석에 나타나지 않는다", () => {
  const multiple = calculateAnalytics({ ...input, worksheets: [{ ...input.worksheets[0], standardIds: ["standard-a", "standard-b"] }], standards: [...input.standards, { id: "standard-b", code: "4수01-02", description: "계산" }] });
  assert.deepEqual(multiple.standardMetrics.map((item) => item.scoreRate), [75, 75]);
  assert.equal(multiple.studentMetrics[0].standards.length, 2);
  const none = calculateAnalytics({ ...input, worksheets: [{ ...input.worksheets[0], standardIds: [] }] });
  assert.equal(none.standardMetrics.length, 0);
  assert.equal(none.studentMetrics[0].standards.length, 0);
});

test("성취수준은 실제 득점률을 보존하면서 계산한다", () => {
  assert.equal(performanceLevel(80), "잘함");
  assert.equal(performanceLevel(60), "보통");
  assert.equal(performanceLevel(59.9), "노력요함");
  const result = calculateAnalytics(input);
  const standard = result.standardMetrics[0];
  assert.equal(standard.scoreRate, 75);
  assert.equal(standard.level, "보통");
});
