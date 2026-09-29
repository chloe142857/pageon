import assert from "node:assert/strict";
import test from "node:test";

import { analyzeWorksheetText, extractPdfPages } from "../src/lib/pdf-import.ts";

const standards = [
  { id: "11111111-1111-4111-8111-111111111111", code: "[4수01-01]", description: "나눗셈의 의미를 이해한다.", grade_band: "3~4학년", area: "수와 연산" },
  { id: "22222222-2222-4222-8222-222222222222", code: "[4도01-01]", description: "도형을 이해한다.", grade_band: "3~4학년", area: "도형과 측정" },
];

function simpleTextPdf(text: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${text.length + 34} >>\nstream\nBT\n/F1 24 Tf\n100 700 Td\n(${text}) Tj\nET\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

test("PDF 활동지 개발용 분석은 텍스트에서 기본 메타데이터와 문항 유형을 추천한다", () => {
    const result = analyzeWorksheetText([
      "3학년 2학기 나눗셈 활동지\n1. 12 ÷ 3을 계산하세요.\n2. 18 ÷ 3의 계산 방법을 설명하세요.",
    ], "나눗셈 연습.pdf", standards);

  assert.equal(result.gradeBand, "3~4학년");
  assert.equal(result.semester, "2학기");
  assert.equal(result.area, "수와 연산");
  assert.deepEqual(result.standardIds, [standards[0].id]);
  assert.equal(result.questions.length, 2);
  assert.deepEqual(result.questions[0], { type: "calculation", questionText: "12 ÷ 3을 계산하세요.", page: 1 });
  assert.equal(result.questions[1].type, "constructed_response");
});

test("PDF 활동지 개발용 분석은 문항 번호를 찾지 못하면 교사 입력용 자리표시자를 만든다", () => {
  const result = analyzeWorksheetText(["스캔된 활동지"], "스캔.pdf", standards);

  assert.deepEqual(result.questions, [{ type: "short_answer", questionText: "원본 PDF의 문항을 확인하여 입력하세요.", page: 1 }]);
});

test("PDF 텍스트 추출은 실제 1페이지 PDF의 페이지 수와 문구를 읽는다", async () => {
  const extracted = await extractPdfPages(simpleTextPdf("12 / 3"));

  assert.equal(extracted.pageCount, 1);
  assert.match(extracted.pages[0], /12 \/ 3/);
});
