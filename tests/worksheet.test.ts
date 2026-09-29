import assert from "node:assert/strict";
import test from "node:test";

import QRCode from "qrcode";

import { buildStructuredContent, parseWorksheetFormData } from "../src/lib/worksheet.ts";

function worksheetFormData() {
  const formData = new FormData();
  formData.set("title", "나눗셈 3차시");
  formData.set("gradeBand", "3~4학년");
  formData.set("semester", "2학기");
  formData.set("area", "수와 연산");
  formData.set("unitName", "나눗셈");
  formData.set("lessonObjective", "나눗셈의 몫을 구할 수 있다.");
  formData.set("totalPages", "3");
  formData.append("worksheetStandardIds", "11111111-1111-4111-8111-111111111111");
  formData.set("questionCount", "1");
  formData.set("question-0-type", "calculation");
  formData.set("question-0-text", "12 ÷ 3을 계산하세요.");
  formData.set("question-0-answer", "4");
  formData.set("question-0-explanation", "3 × 4 = 12");
  formData.set("question-0-score", "2");
  formData.set("question-0-standard", "11111111-1111-4111-8111-111111111111");
  formData.set("question-0-page", "1");
  formData.set("question-0-answer-bbox", "0.1, 0.5, 0.8, 0.2");
  return formData;
}

test("활동지 FormData는 구조화된 문항 입력으로 변환된다", () => {
  const input = parseWorksheetFormData(worksheetFormData());
  assert.equal(input.questions[0].type, "calculation");
  assert.equal(input.questions[0].score, 2);
  assert.equal(input.totalPages, 3);
  assert.deepEqual(input.questions[0].answerBBox, { x: 0.1, y: 0.5, width: 0.8, height: 0.2 });

  const structured = buildStructuredContent(
    { ...input, id: "worksheet-1", versionNumber: 1, generationSource: "manual" },
    [{ ...input.questions[0], id: "question-1", achievementStandardCode: "4수01-01" }],
  );
  assert.equal(structured.questions[0].question_id, "question-1");
  assert.equal(structured.questions[0].achievement_standard, "4수01-01");
  assert.equal(structured.questions[0].regions.coordinate_space, "normalized_0_to_1");
  assert.deepEqual(structured.questions[0].regions.answer_bbox, { x: 0.1, y: 0.5, width: 0.8, height: 0.2 });
});

test("활동지 전용 URL은 PNG QR로 생성된다", async () => {
  const dataUrl = await QRCode.toDataURL("https://example.com/submit/private-worksheet-token");
  assert.match(dataUrl, /^data:image\/png;base64,/);
});
