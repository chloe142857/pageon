import { z } from "zod";

export const questionTypes = [
  "multiple_choice",
  "short_answer",
  "calculation",
  "constructed_response",
] as const;

export type QuestionType = (typeof questionTypes)[number];
export type GenerationSource = "manual" | "mock" | "pdf_import";
export type QuestionCategory = QuestionType | "word_problem";

export type NormalizedBox = { x: number; y: number; width: number; height: number };

export type WorksheetQuestionInput = {
  type: QuestionType;
  category?: QuestionCategory;
  questionText: string;
  answer: string;
  explanation: string;
  score: number;
  achievementStandardId: string;
  page: number;
  answerBBox: NormalizedBox | null;
};

export type WorksheetInput = {
  title: string;
  curriculumGrade?: number;
  gradeBand: string;
  semester: string;
  area: string;
  unitName: string;
  lessonObjective: string;
  totalPages: number;
  worksheetStandardIds: string[];
  questions: WorksheetQuestionInput[];
};

const worksheetSchema = z.object({
  title: z.string().trim().min(1, "활동지 제목을 입력하세요.").max(120),
  curriculumGrade: z.coerce.number().int().min(1).max(6).optional(),
  gradeBand: z.string().trim().min(1, "학년군을 선택하세요.").max(30),
  semester: z.string().trim().min(1, "학기를 선택하세요.").max(30),
  area: z.string().trim().max(60),
  unitName: z.string().trim().max(120),
  lessonObjective: z.string().trim().min(1, "차시 목표를 입력하세요.").max(500),
  totalPages: z.coerce.number().int().min(1, "전체 페이지 수는 1 이상이어야 합니다.").max(30),
  worksheetStandardIds: z.array(z.string().uuid()).min(1, "성취기준을 하나 이상 선택하세요."),
  questions: z.array(z.object({
    type: z.enum(questionTypes),
    category: z.enum([...questionTypes, "word_problem"]).optional(),
    questionText: z.string().trim().min(1, "문항 내용을 입력하세요.").max(4000),
    answer: z.string().trim().min(1, "정답을 입력하세요.").max(2000),
    explanation: z.string().trim().max(4000),
    score: z.coerce.number().min(0, "배점은 0 이상이어야 합니다.").max(100),
    achievementStandardId: z.string().uuid("문항 성취기준을 선택하세요."),
    page: z.coerce.number().int().min(1).max(100),
    answerBBox: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().positive().max(1),
      height: z.number().positive().max(1),
    }).nullable(),
  })).min(1, "문항을 하나 이상 입력하세요.").max(30),
});

export function parseWorksheetFormData(formData: FormData): WorksheetInput {
  const questionCount = Number(formData.get("questionCount"));
  const questions = Array.from({ length: Number.isInteger(questionCount) && questionCount > 0 ? questionCount : 0 }, (_, index) => ({
    type: formData.get(`question-${index}-type`),
    category: formData.get(`question-${index}-category`) || undefined,
    questionText: formData.get(`question-${index}-text`),
    answer: formData.get(`question-${index}-answer`),
    explanation: formData.get(`question-${index}-explanation`) || "",
    score: formData.get(`question-${index}-score`),
    achievementStandardId: formData.get(`question-${index}-standard`),
    page: formData.get(`question-${index}-page`),
    answerBBox: parseAnswerBBox(formData.get(`question-${index}-answer-bbox`)),
  }));

  const parsed = worksheetSchema.safeParse({
    title: formData.get("title"),
    curriculumGrade: formData.get("curriculumGrade") || undefined,
    gradeBand: formData.get("gradeBand"),
    semester: formData.get("semester"),
    area: formData.get("area") || "",
    unitName: formData.get("unitName") || "",
    lessonObjective: formData.get("lessonObjective"),
    totalPages: formData.get("totalPages"),
    worksheetStandardIds: formData.getAll("worksheetStandardIds"),
    questions,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "활동지 입력을 확인하세요.");
  }

  const worksheetStandardIds = [...new Set([
    ...parsed.data.worksheetStandardIds,
    ...parsed.data.questions.map((question) => question.achievementStandardId),
  ])];

  const pageOutsideWorksheet = parsed.data.questions.find((question) => question.page > parsed.data.totalPages);
  if (pageOutsideWorksheet) throw new Error("문항 페이지는 전체 페이지 수보다 클 수 없습니다.");
  return { ...parsed.data, worksheetStandardIds };
}

function parseAnswerBBox(value: FormDataEntryValue | null): NormalizedBox | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const values = raw.split(",").map((part) => Number(part.trim()));
  if (values.length !== 4 || values.some((part) => !Number.isFinite(part))) {
    throw new Error("답안 영역은 x, y, 너비, 높이 순서의 숫자 네 개로 입력하세요.");
  }
  const [x, y, width, height] = values;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
    throw new Error("답안 영역 좌표는 0~1 범위 안에 있어야 합니다.");
  }
  return { x, y, width, height };
}

export function buildStructuredContent(
  worksheet: Omit<WorksheetInput, "questions"> & { id: string; versionNumber: number; generationSource: GenerationSource },
  questions: Array<WorksheetQuestionInput & { id: string; achievementStandardCode: string }>,
) {
  return {
    schema_version: 1,
    generation_source: worksheet.generationSource,
    worksheet: {
      worksheet_id: worksheet.id,
      title: worksheet.title,
      curriculum_grade: worksheet.curriculumGrade ?? null,
      grade_band: worksheet.gradeBand,
      semester: worksheet.semester,
      area: worksheet.area,
      unit_name: worksheet.unitName,
      lesson_objective: worksheet.lessonObjective,
      total_pages: worksheet.totalPages,
      version_number: worksheet.versionNumber,
    },
    questions: questions.map((question, index) => ({
      question_id: question.id,
      number: index + 1,
      type: question.type,
      category: question.category ?? question.type,
      question_text: question.questionText,
      answer: question.answer,
      explanation: question.explanation,
      score: question.score,
      achievement_standard: question.achievementStandardCode,
      page: question.page,
      regions: {
        coordinate_space: "normalized_0_to_1",
        question_bbox: null,
        answer_bbox: question.answerBBox,
      },
    })),
  };
}
