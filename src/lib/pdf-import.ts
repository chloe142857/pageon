import type { QuestionType } from "./worksheet";

type Standard = { id: string; code: string; description: string; grade_band: string; area: string };

export type PdfImportSuggestion = {
  title: string;
  gradeBand: string;
  semester: string;
  area: string;
  unitName: string;
  lessonObjective: string;
  standardIds: string[];
  questions: Array<{ type: QuestionType; questionText: string; page: number }>;
};

function recommendGradeBand(text: string) {
  const grade = text.match(/([1-6])\s*학년/)?.[1];
  if (grade === "1" || grade === "2") return "1~2학년";
  if (grade === "5" || grade === "6") return "5~6학년";
  return "3~4학년";
}

function recommendArea(text: string) {
  if (/도형|각도|삼각형|사각형|원/.test(text)) return "도형과 측정";
  if (/분수|소수|나눗셈|곱셈|덧셈|뺄셈|계산/.test(text)) return "수와 연산";
  if (/그래프|자료|표|확률/.test(text)) return "자료와 가능성";
  if (/규칙|관계|식/.test(text)) return "변화와 관계";
  return "";
}

function recommendType(text: string): QuestionType {
  if (/고르|선택|보기/.test(text)) return "multiple_choice";
  if (/설명|이유|생각|방법/.test(text)) return "constructed_response";
  if (/계산|÷|×|\+|−|-/.test(text)) return "calculation";
  return "short_answer";
}

function recommendedStandard(standards: Standard[], gradeBand: string, area: string) {
  return standards.find((standard) => standard.grade_band === gradeBand && (!area || standard.area === area))
    ?? standards.find((standard) => standard.grade_band === gradeBand)
    ?? standards[0];
}

/** API 키가 없는 개발 환경의 명시적 목 분석이다. 교사가 모든 제안을 수정·확정해야 한다. */
export function analyzeWorksheetText(pages: string[], filename: string, standards: Standard[]): PdfImportSuggestion {
  const fullText = pages.join("\n");
  const gradeBand = recommendGradeBand(fullText);
  const area = recommendArea(fullText);
  const standard = recommendedStandard(standards, gradeBand, area);
  const questions = pages.flatMap((pageText, pageIndex) => {
    const candidates = pageText.split(/\n+/).map((line) => line.trim()).filter((line) => /^\d{1,2}[.)、]/.test(line));
    return candidates.map((questionText) => ({
      type: recommendType(questionText),
      questionText: questionText.replace(/^\d{1,2}[.)、]\s*/, "") || "원본 PDF 문항을 확인해 입력하세요.",
      page: pageIndex + 1,
    }));
  }).slice(0, 30);
  return {
    title: filename.replace(/\.pdf$/i, "") || "기존 활동지",
    gradeBand,
    semester: /2\s*학기/.test(fullText) ? "2학기" : "1학기",
    area,
    unitName: "",
    lessonObjective: "원본 PDF의 차시 목표를 확인하여 입력하세요.",
    standardIds: standard ? [standard.id] : [],
    questions: questions.length ? questions : [{ type: "short_answer", questionText: "원본 PDF의 문항을 확인하여 입력하세요.", page: 1 }],
  };
}

export async function extractPdfPages(pdf: Buffer) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({ data: new Uint8Array(pdf) });
  const document = await loadingTask.promise;
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => "str" in item ? item.str : "").join("\n"));
    }
    return { pageCount: document.numPages, pages };
  } finally {
    await loadingTask.destroy();
  }
}
