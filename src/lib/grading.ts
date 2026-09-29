import { z } from "zod";

import type { QuestionType } from "./worksheet";

const AUTO_CONFIRM_RECOGNITION_CONFIDENCE = 85;

export const gradingResults = ["correct", "partial", "incorrect", "unreadable"] as const;
export type GradingResult = (typeof gradingResults)[number];
export type GradingStatus = "AUTO_CONFIRMED" | "REVIEW_REQUIRED" | "TEACHER_CONFIRMED";

export type GradeDecision = {
  predictedResult: GradingResult;
  confidence: number;
  reasoningSummary: string;
  needsTeacherReview: boolean;
  gradingStatus: Exclude<GradingStatus, "TEACHER_CONFIRMED">;
  gradingStrategy: "exact" | "normalized" | "semantic_ai" | "semantic_unavailable" | "unreadable";
  modelName: string | null;
};

type GradeInput = {
  type: QuestionType;
  questionText: string;
  expectedAnswer: string;
  explanation: string;
  recognizedText: string | null;
  recognitionConfidence: number | null;
  recognitionError: string | null;
};

function normalizeFraction(value: string) {
  const match = value.match(/^(-?\d+)\/(-?\d+)$/);
  if (!match) return value;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator === 0) return value;
  const gcd = (a: number, b: number): number => b === 0 ? Math.abs(a) : gcd(b, a % b);
  const divisor = gcd(numerator, denominator);
  const sign = denominator < 0 ? -1 : 1;
  return `${(numerator / divisor) * sign}/${Math.abs(denominator / divisor)}`;
}

/** 비교용 값만 정규화한다. 학생 원문 OCR 결과는 submission_answers에 그대로 보존된다. */
export function normalizeAnswer(value: string) {
  const circledChoices: Record<string, string> = { "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5" };
  const compact = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[①②③④⑤]/g, (choice) => circledChoices[choice])
    .replace(/\s/g, "")
    .replace(/[−–—]/g, "-");
  if (/^-?\d+(?:\.\d+)?$/.test(compact)) return String(Number(compact));
  const normalized = compact.replace(/[,:;，.。!?！？'"“”‘’()（）\[\]{}]/g, "");
  return normalizeFraction(normalized);
}

function reviewDecision(
  predictedResult: GradingResult,
  confidence: number,
  reasoningSummary: string,
  gradingStrategy: GradeDecision["gradingStrategy"],
  modelName: string | null = null,
): GradeDecision {
  return {
    predictedResult,
    confidence: Number(Math.max(0, Math.min(1, confidence)).toFixed(4)),
    reasoningSummary,
    needsTeacherReview: true,
    gradingStatus: "REVIEW_REQUIRED",
    gradingStrategy,
    modelName,
  };
}

function exactOrNormalizedDecision(input: GradeInput, strategy: "exact" | "normalized"): GradeDecision {
  if (input.recognitionError || !input.recognizedText?.trim()) {
    return reviewDecision("unreadable", 0, "OCR 결과가 없거나 인식에 실패했습니다. 실제 답안 이미지를 확인하세요.", "unreadable");
  }

  const isCorrect = normalizeAnswer(input.recognizedText) === normalizeAnswer(input.expectedAnswer);
  const recognitionConfidence = input.recognitionConfidence ?? 0;
  const confidence = Math.min(0.99, 0.55 + recognitionConfidence / 200);
  const result: GradingResult = isCorrect ? "correct" : "incorrect";
  const summary = isCorrect
    ? (strategy === "exact" ? "선택지 OCR 결과가 정답과 일치합니다." : "정규화한 OCR 답이 정답과 일치합니다.")
    : (strategy === "exact" ? "선택지 OCR 결과가 정답과 일치하지 않습니다." : "정규화한 OCR 답이 정답과 일치하지 않습니다.");

  if (recognitionConfidence >= AUTO_CONFIRM_RECOGNITION_CONFIDENCE) {
    return {
      predictedResult: result,
      confidence: Number(confidence.toFixed(4)),
      reasoningSummary: summary,
      needsTeacherReview: false,
      gradingStatus: "AUTO_CONFIRMED",
      gradingStrategy: strategy,
      modelName: null,
    };
  }
  return reviewDecision(result, confidence, `${summary} OCR 신뢰도가 낮아 교사 확인이 필요합니다.`, strategy);
}

const semanticOutputSchema = z.object({
  predicted_result: z.enum(gradingResults),
  confidence: z.number().min(0).max(1),
  reasoning_summary: z.string().min(1).max(500),
  needs_teacher_review: z.boolean(),
});

function responseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { output_text?: unknown; output?: unknown };
  if (typeof record.output_text === "string") return record.output_text;
  if (!Array.isArray(record.output)) return null;
  for (const item of record.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && (part as { type?: unknown }).type === "output_text") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string") return text;
      }
    }
  }
  return null;
}

async function semanticGrade(input: GradeInput): Promise<GradeDecision> {
  if (input.recognitionError || !input.recognizedText?.trim()) {
    return reviewDecision("unreadable", 0, "OCR 결과가 없거나 인식에 실패했습니다. 실제 답안 이미지를 확인하세요.", "unreadable");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const modelName = process.env.OPENAI_GRADING_MODEL;
  if (!apiKey || !modelName) {
    return reviewDecision("unreadable", 0, "AI 의미 채점이 설정되지 않았습니다. 실제 답안 이미지를 교사가 확인하세요.", "semantic_unavailable");
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        store: false,
        max_output_tokens: 250,
        instructions: "You grade a Korean elementary mathematics constructed response. Evaluate only the supplied OCR text against the question, expected answer, and teacher explanation. Return the requested JSON. reasoning_summary must be a brief teacher-facing verdict, not step-by-step hidden reasoning. Set needs_teacher_review true whenever the OCR text is ambiguous, incomplete, or the answer needs human judgment.",
        input: JSON.stringify({
          question: input.questionText,
          expected_answer: input.expectedAnswer,
          teacher_explanation: input.explanation,
          student_ocr_answer: input.recognizedText,
          recognition_confidence: input.recognitionConfidence,
        }),
        text: {
          format: {
            type: "json_schema",
            name: "constructed_response_grade",
            strict: true,
            schema: {
              type: "object",
              properties: {
                predicted_result: { type: "string", enum: gradingResults },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                reasoning_summary: { type: "string" },
                needs_teacher_review: { type: "boolean" },
              },
              required: ["predicted_result", "confidence", "reasoning_summary", "needs_teacher_review"],
              additionalProperties: false,
            },
          },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`AI 채점 요청 실패 (${response.status})`);
    const parsed = semanticOutputSchema.parse(JSON.parse(responseText(await response.json()) ?? "null"));
    const lowRecognition = (input.recognitionConfidence ?? 0) < AUTO_CONFIRM_RECOGNITION_CONFIDENCE;
    const needsTeacherReview = parsed.needs_teacher_review || lowRecognition;
    return {
      predictedResult: parsed.predicted_result,
      confidence: Number(parsed.confidence.toFixed(4)),
      reasoningSummary: lowRecognition ? `${parsed.reasoning_summary} OCR 신뢰도가 낮아 교사 확인이 필요합니다.` : parsed.reasoning_summary,
      needsTeacherReview,
      gradingStatus: needsTeacherReview ? "REVIEW_REQUIRED" : "AUTO_CONFIRMED",
      gradingStrategy: "semantic_ai",
      modelName,
    };
  } catch {
    return reviewDecision("unreadable", 0, "AI 의미 채점에 실패했습니다. 실제 답안 이미지를 교사가 확인하세요.", "semantic_unavailable", modelName);
  }
}

export async function gradeAnswer(input: GradeInput): Promise<GradeDecision> {
  if (input.type === "multiple_choice") return exactOrNormalizedDecision(input, "exact");
  if (input.type === "short_answer" || input.type === "calculation") return exactOrNormalizedDecision(input, "normalized");
  return semanticGrade(input);
}

export async function gradeSubmissionAnswers(submissionId: string) {
  const { createSupabaseAdminClient } = await import("./supabase/server");
  const admin = createSupabaseAdminClient();
  const { data: pages, error: pagesError } = await admin
    .from("submission_pages")
    .select("id")
    .eq("submission_id", submissionId);
  if (pagesError) throw pagesError;
  const pageIds = pages?.map((page) => page.id) ?? [];
  if (!pageIds.length) return 0;

  const { data: answers, error: answersError } = await admin
    .from("submission_answers")
    .select("id, recognized_text, recognition_confidence, recognition_error, worksheet_questions!inner(type, question_text, answer, explanation)")
    .in("submission_page_id", pageIds);
  if (answersError) throw answersError;

  for (const answer of answers ?? []) {
    const question = Array.isArray(answer.worksheet_questions) ? answer.worksheet_questions[0] : answer.worksheet_questions;
    if (!question) continue;
    const decision = await gradeAnswer({
      type: question.type as QuestionType,
      questionText: question.question_text,
      expectedAnswer: question.answer,
      explanation: question.explanation,
      recognizedText: answer.recognized_text,
      recognitionConfidence: answer.recognition_confidence === null ? null : Number(answer.recognition_confidence),
      recognitionError: answer.recognition_error,
    });
    const { error } = await admin.from("ai_grading_results").upsert({
      submission_answer_id: answer.id,
      predicted_result: decision.predictedResult,
      confidence: decision.confidence,
      reasoning_summary: decision.reasoningSummary,
      needs_teacher_review: decision.needsTeacherReview,
      grading_status: decision.gradingStatus,
      grading_strategy: decision.gradingStrategy,
      model_name: decision.modelName,
    }, { onConflict: "submission_answer_id" });
    if (error) throw error;
  }
  return answers?.length ?? 0;
}
