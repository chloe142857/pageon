import { calculateAnalytics, type AnalyticsAnswer, type AnalyticsInput, type AnalyticsStudent, type AnalyticsSubmission, type AnalyticsWorksheet } from "./analytics";
import { createSupabaseAdminClient } from "./supabase/server";

export type AnalyticsFilters = {
  classroomId?: string;
  studentId?: string;
  gradeBand?: string;
  semester?: string;
  area?: string;
  unitName?: string;
  standardId?: string;
  worksheetId?: string;
  from?: string;
  to?: string;
};

function value(raw: string | string[] | undefined) {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export function parseAnalyticsFilters(searchParams: Record<string, string | string[] | undefined>): AnalyticsFilters {
  return {
    classroomId: value(searchParams.classroomId), studentId: value(searchParams.studentId), gradeBand: value(searchParams.gradeBand),
    semester: value(searchParams.semester), area: value(searchParams.area), unitName: value(searchParams.unitName),
    standardId: value(searchParams.standardId), worksheetId: value(searchParams.worksheetId), from: value(searchParams.from), to: value(searchParams.to),
  };
}

export function analyticsQuery(filters: AnalyticsFilters) {
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(filters)) if (raw) params.set(key, raw);
  return params.toString();
}

function resultScore(result: "correct" | "partial" | "incorrect" | "unreadable", maximum: number) {
  return result === "correct" ? maximum : result === "partial" ? Math.round(maximum * 50) / 100 : 0;
}

export async function loadTeacherAnalytics(teacherId: string, filters: AnalyticsFilters) {
  const admin = createSupabaseAdminClient();
  const [{ data: classrooms }, { data: allStudents }, { data: standards }] = await Promise.all([
    admin.from("classrooms").select("id, name, school_year").eq("teacher_id", teacherId).is("archived_at", null).order("name"),
    admin.from("students").select("id, classroom_id, display_name, student_number, active, classrooms!inner(teacher_id)").eq("classrooms.teacher_id", teacherId).order("student_number"),
    admin.from("achievement_standards").select("id, code, description").order("code"),
  ]);
  const students = (allStudents ?? []).filter((student) => (!filters.classroomId || student.classroom_id === filters.classroomId) && (!filters.studentId || student.id === filters.studentId))
    .map((student): AnalyticsStudent => ({ id: student.id, classroomId: student.classroom_id, displayName: student.display_name, studentNumber: student.student_number, active: student.active }));
  let worksheetQuery = admin.from("worksheets").select("id, title, grade_band, semester, area, unit_name").eq("teacher_id", teacherId).order("updated_at", { ascending: false });
  if (filters.gradeBand) worksheetQuery = worksheetQuery.eq("grade_band", filters.gradeBand);
  if (filters.semester) worksheetQuery = worksheetQuery.eq("semester", filters.semester);
  if (filters.area) worksheetQuery = worksheetQuery.eq("area", filters.area);
  if (filters.unitName) worksheetQuery = worksheetQuery.eq("unit_name", filters.unitName);
  if (filters.worksheetId) worksheetQuery = worksheetQuery.eq("id", filters.worksheetId);
  const { data: worksheetRows } = await worksheetQuery;
  const worksheetIds = (worksheetRows ?? []).map((worksheet) => worksheet.id);
  const { data: worksheetStandardRows } = worksheetIds.length
    ? await admin.from("worksheet_standards").select("worksheet_id, achievement_standard_id").in("worksheet_id", worksheetIds)
    : { data: [] };
  const worksheets = (worksheetRows ?? []).map((worksheet): AnalyticsWorksheet => ({
    id: worksheet.id, title: worksheet.title, gradeBand: worksheet.grade_band, semester: worksheet.semester,
    area: worksheet.area, unitName: worksheet.unit_name,
    standardIds: (worksheetStandardRows ?? []).filter((row) => row.worksheet_id === worksheet.id).map((row) => row.achievement_standard_id),
  }));
  const matchingWorksheetIds = new Set(worksheets.filter((worksheet) => !filters.standardId || worksheet.standardIds.includes(filters.standardId)).map((worksheet) => worksheet.id));
  const { data: questionRows } = worksheetIds.length
    ? await admin.from("worksheet_questions").select("id, worksheet_id, question_number, question_text, score").in("worksheet_id", worksheetIds).order("question_number")
    : { data: [] };
  const questions = (questionRows ?? []).filter((question) => matchingWorksheetIds.has(question.worksheet_id))
    .map((question) => ({ id: question.id, worksheetId: question.worksheet_id, questionNumber: question.question_number, questionText: question.question_text, score: Number(question.score) }));
  const questionIds = new Set(questions.map((question) => question.id));
  const studentIds = students.map((student) => student.id);
  let submissionRows: Array<{ id: string; worksheet_id: string; student_id: string; submitted_at: string | null }> = [];
  if (worksheetIds.length && studentIds.length) {
    let query = admin.from("submissions").select("id, worksheet_id, student_id, submitted_at").in("worksheet_id", worksheetIds).in("student_id", studentIds).eq("status", "submitted");
    if (filters.from) query = query.gte("submitted_at", `${filters.from}T00:00:00.000Z`);
    if (filters.to) query = query.lte("submitted_at", `${filters.to}T23:59:59.999Z`);
    const { data } = await query.order("submitted_at");
    submissionRows = data ?? [];
  }
  const submissions: AnalyticsSubmission[] = submissionRows.map((submission) => ({ id: submission.id, worksheetId: submission.worksheet_id, studentId: submission.student_id, submittedAt: submission.submitted_at }));
  const submissionIds = submissions.map((submission) => submission.id);
  const { data: pages } = submissionIds.length ? await admin.from("submission_pages").select("id, submission_id").in("submission_id", submissionIds) : { data: [] };
  const pageToSubmission = new Map((pages ?? []).map((page) => [page.id, page.submission_id]));
  const pageIds = [...pageToSubmission.keys()];
  const { data: answerRows } = pageIds.length ? await admin.from("submission_answers").select("id, submission_page_id, question_id").in("submission_page_id", pageIds) : { data: [] };
  const answers = (answerRows ?? []).filter((answer) => questionIds.has(answer.question_id));
  const answerIds = answers.map((answer) => answer.id);
  const [{ data: aiRows }, { data: finalRows }] = await Promise.all([
    answerIds.length ? admin.from("ai_grading_results").select("submission_answer_id, predicted_result, grading_status").in("submission_answer_id", answerIds) : Promise.resolve({ data: [] }),
    answerIds.length ? admin.from("final_grading_results").select("submission_answer_id, result, score_awarded").in("submission_answer_id", answerIds) : Promise.resolve({ data: [] }),
  ]);
  const aiByAnswer = new Map((aiRows ?? []).map((item) => [item.submission_answer_id, item]));
  const finalByAnswer = new Map((finalRows ?? []).map((item) => [item.submission_answer_id, item]));
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const effectiveAnswers = answers.reduce<AnalyticsAnswer[]>((collected, answer) => {
    const question = questionById.get(answer.question_id);
    const submissionId = pageToSubmission.get(answer.submission_page_id);
    if (!question || !submissionId) return collected;
    const final = finalByAnswer.get(answer.id);
    if (final) {
      collected.push({ submissionId, questionId: answer.question_id, result: final.result, scoreAwarded: Number(final.score_awarded), source: "teacher" });
      return collected;
    }
    const ai = aiByAnswer.get(answer.id);
    if (ai?.grading_status === "AUTO_CONFIRMED") {
      collected.push({ submissionId, questionId: answer.question_id, result: ai.predicted_result, scoreAwarded: resultScore(ai.predicted_result, question.score), source: "auto" });
    }
    return collected;
  }, []);
  const input: AnalyticsInput = { students, worksheets, questions, submissions, answers: effectiveAnswers, standards: (standards ?? []).map((standard) => ({ id: standard.id, code: standard.code, description: standard.description })), classroomId: filters.classroomId, worksheetId: filters.worksheetId };
  return { ...calculateAnalytics(input), raw: input, classrooms: classrooms ?? [], allStudents: allStudents ?? [], allWorksheets: worksheetRows ?? [], allStandards: standards ?? [], filters };
}
