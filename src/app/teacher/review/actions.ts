"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireTeacher } from "@/lib/auth/teacher";
import { gradingResults } from "@/lib/grading";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const reviewSchema = z.object({
  answerId: z.string().uuid(),
  decision: z.enum(["approve", ...gradingResults]),
  teacherNote: z.string().trim().max(1000),
});

function redirectWithMessage(key: "error" | "notice", message: string): never {
  redirect(`/teacher/review?${key}=${encodeURIComponent(message)}`);
}

export async function saveTeacherReview(formData: FormData) {
  const parsed = reviewSchema.safeParse({
    answerId: formData.get("answerId"),
    decision: formData.get("decision"),
    teacherNote: formData.get("teacherNote") ?? "",
  });
  if (!parsed.success) redirectWithMessage("error", "검토 결과를 선택하고 다시 시도하세요.");

  const teacher = await requireTeacher();
  const admin = createSupabaseAdminClient();
  const { data: answer, error: answerError } = await admin
    .from("submission_answers")
    .select("id, question_id, submission_page_id")
    .eq("id", parsed.data.answerId)
    .maybeSingle();
  if (answerError || !answer) redirectWithMessage("error", "답안을 찾을 수 없습니다.");

  const { data: page } = await admin
    .from("submission_pages")
    .select("submission_id")
    .eq("id", answer.submission_page_id)
    .maybeSingle();
  if (!page) redirectWithMessage("error", "제출 페이지를 찾을 수 없습니다.");

  const { data: submission } = await admin
    .from("submissions")
    .select("id, worksheet_id, worksheets!inner(teacher_id)")
    .eq("id", page.submission_id)
    .eq("worksheets.teacher_id", teacher.id)
    .maybeSingle();
  if (!submission) redirectWithMessage("error", "이 답안을 검토할 권한이 없습니다.");

  const [{ data: aiResult }, { data: question }] = await Promise.all([
    admin.from("ai_grading_results").select("predicted_result").eq("submission_answer_id", answer.id).maybeSingle(),
    admin.from("worksheet_questions").select("score").eq("id", answer.question_id).maybeSingle(),
  ]);
  if (!aiResult || !question) redirectWithMessage("error", "자동채점 정보를 찾을 수 없습니다.");

  const result = parsed.data.decision === "approve" ? aiResult.predicted_result : parsed.data.decision;
  const maximumScore = Number(question.score);
  const scoreAwarded = result === "correct" ? maximumScore : result === "partial" ? Math.round(maximumScore * 50) / 100 : 0;
  const { error: saveError } = await admin.from("final_grading_results").upsert({
    submission_answer_id: answer.id,
    result,
    score_awarded: scoreAwarded,
    grading_status: "TEACHER_CONFIRMED",
    teacher_id: teacher.id,
    teacher_note: parsed.data.teacherNote,
    confirmed_at: new Date().toISOString(),
  }, { onConflict: "submission_answer_id" });
  if (saveError) redirectWithMessage("error", "교사 최종 판정을 저장하지 못했습니다.");

  revalidatePath("/teacher/review");
  revalidatePath(`/teacher/submissions/${page.submission_id}`);
  revalidatePath(`/teacher/worksheets/${submission.worksheet_id}`);
  redirectWithMessage("notice", "교사 최종 판정을 저장했습니다.");
}
