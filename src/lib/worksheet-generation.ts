import { z } from "zod";

import type { QuestionType, WorksheetQuestionInput } from "./worksheet";

export const generationCategories = ["short_answer", "multiple_choice", "constructed_response", "calculation", "word_problem"] as const;
export type GenerationCategory = (typeof generationCategories)[number];
export const generationTotals = [10, 20, 30] as const;

const generatedQuestionSchema = z.object({
  question_text: z.string().trim().min(5).max(350),
  answer: z.string().trim().min(1).max(500),
  explanation: z.string().trim().min(1).max(1000),
});

const generatedBatchSchema = z.object({ questions: z.array(generatedQuestionSchema) });

type Standard = { id: string; code: string; description: string };
export type GenerationSpec = {
  grade: number;
  semester: string;
  unitName: string;
  lessonObjective: string;
  area: string;
  total: number;
  counts: Record<GenerationCategory, number>;
  standards: Standard[];
};

const categoryLabels: Record<GenerationCategory, string> = {
  short_answer: "단답형",
  multiple_choice: "객관식",
  constructed_response: "서술형",
  calculation: "단순 연산",
  word_problem: "문장제 문제",
};

function models() {
  return [...new Set([
    process.env.UPSTAGE_GRADING_MODEL || "solar-pro4",
    ...(process.env.UPSTAGE_GRADING_FALLBACK_MODELS || "solar-pro3,solar-mini4").split(",").map((item) => item.trim()).filter(Boolean),
  ])];
}

function batches(category: GenerationCategory, count: number) {
  const result: Array<{ category: GenerationCategory; count: number }> = [];
  for (let remaining = count; remaining > 0; remaining -= 6) result.push({ category, count: Math.min(remaining, 6) });
  return result;
}

async function generateBatch(spec: GenerationSpec, category: GenerationCategory, count: number, batchNumber: number) {
  const key = process.env.UPSTAGE_API_KEY;
  if (!key) throw new Error("Upstage API 키가 설정되지 않았습니다. 서버 환경 변수 UPSTAGE_API_KEY를 확인하세요.");
  const baseUrl = (process.env.UPSTAGE_API_BASE_URL || "https://api.upstage.ai/v1").replace(/\/$/, "");
  const responseFormat = {
    type: "json_schema",
    json_schema: {
      name: "elementary_math_worksheet_questions",
      strict: true,
      schema: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question_text: { type: "string" },
                answer: { type: "string" },
                explanation: { type: "string" },
              },
              required: ["question_text", "answer", "explanation"],
              additionalProperties: false,
            },
          },
        },
        required: ["questions"],
        additionalProperties: false,
      },
    },
  };
  let lastError = "AI 문항 생성에 실패했습니다.";
  for (const model of models()) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: 3600,
          messages: [
            { role: "system", content: "초등 수학 교사용 종이 활동지 문항을 만든다. 모든 문항, 보기, 상황, 단위, 정답과 해설은 자연스러운 한국어로만 쓴다. 영어 단어, 영어권 인명, 외국 화폐, 영문 상품명(예: sweets)은 절대 사용하지 않는다. 주어진 학년·차시 목표에 맞춰 정확한 수학 문제와 정답/해설을 작성한다. 활동지 전체에 지정된 성취기준이 있으면 참고하되 문항마다 성취기준을 부여하지 않는다. 요청 개수만큼 서로 다른 문항을 만든다. A4 한 쪽에 10문항을 인쇄할 수 있도록 문항 본문은 보기 포함 180자 이내로 간결하게 쓴다. 객관식은 보기 4개와 정답 보기를 포함한다. 문장제는 우리나라 초등학생에게 익숙한 학교·가정·동네 상황에서 식을 세워 푸는 문제로 만들되, answer에는 자동 비교할 수 있는 최종 값과 단위만 적고 풀이식은 explanation에 적는다. 서술형은 풀이 또는 이유를 쓰게 한다. 단순 연산의 question_text는 설명 문장 없이 ‘347 + 185 =’처럼 숫자와 연산기호만 포함한 한 줄 계산식으로 쓴다. JSON 형식으로만 응답한다." },
            { role: "user", content: JSON.stringify({ grade: spec.grade, semester: spec.semester, area: spec.area, unit: spec.unitName, lesson_objective: spec.lessonObjective, standards: spec.standards.map((item) => ({ code: item.code, description: item.description })), question_category: categoryLabels[category], count, batch_number: batchNumber }) },
          ],
          response_format: responseFormat,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) {
        lastError = `Upstage 요청 오류 (${response.status})`;
        if (![400, 408, 413, 429].includes(response.status) && response.status < 500) break;
        continue;
      }
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const result = generatedBatchSchema.parse(JSON.parse(payload.choices?.[0]?.message?.content ?? "null"));
      if (result.questions.length !== count) throw new Error("요청한 문항 수와 AI 응답의 문항 수가 다릅니다.");
      return { questions: result.questions, model };
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

function questionType(category: GenerationCategory): QuestionType {
  return category === "word_problem" ? "short_answer" : category;
}

export function paginateGeneratedQuestions(questions: WorksheetQuestionInput[]) {
  return questions.map((question, index) => ({ ...question, page: Math.floor(index / 10) + 1 }));
}

export async function generateWorksheetQuestions(spec: GenerationSpec) {
  const requests = generationCategories.flatMap((category) => batches(category, spec.counts[category]));
  let batchNumber = 0;
  const results = await Promise.all(requests.map((request) => generateBatch(spec, request.category, request.count, ++batchNumber)));
  const questions: WorksheetQuestionInput[] = results.flatMap((result, index) => result.questions.map((item) => {
    const category = requests[index].category;
    return {
      type: questionType(category),
      category,
      questionText: item.question_text,
      answer: item.answer,
      explanation: item.explanation,
      score: category === "constructed_response" ? 3 : category === "word_problem" ? 2 : 1,
      page: 1,
      answerBBox: null,
    };
  }));
  if (questions.length !== spec.total) throw new Error("AI 생성 문항 수가 요청과 다릅니다.");
  return { questions: paginateGeneratedQuestions(questions), modelsUsed: [...new Set(results.map((result) => result.model))] };
}
