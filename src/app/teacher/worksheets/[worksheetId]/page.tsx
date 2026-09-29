import Link from "next/link";
import { notFound } from "next/navigation";

import { WorksheetEditor } from "@/components/worksheet-editor";
import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

import { publishWorksheet, saveWorksheet } from "../actions";

type PageProps = { params: Promise<{ worksheetId: string }>; searchParams: Promise<{ error?: string; notice?: string }> };

export const dynamic = "force-dynamic";

export default async function WorksheetDetailPage({ params, searchParams }: PageProps) {
  const teacher = await requireTeacher();
  const { worksheetId } = await params;
  const { error, notice } = await searchParams;
  const admin = createSupabaseAdminClient();
  const { data: worksheet } = await admin
    .from("worksheets")
    .select("id, title, grade_band, semester, area, unit_name, lesson_objective, total_pages, generation_source, structured_content, status, version_number, worksheet_token")
    .eq("id", worksheetId)
    .eq("teacher_id", teacher.id)
    .maybeSingle();
  if (!worksheet) notFound();

  const [{ data: standards }, { data: worksheetStandards }, { data: questions }, { data: submissions }, { data: pdfImport }] = await Promise.all([
    admin.from("achievement_standards").select("id, code, description, grade_band, area").order("code"),
    admin.from("worksheet_standards").select("achievement_standard_id").eq("worksheet_id", worksheetId),
    admin.from("worksheet_questions").select("type, question_text, answer, explanation, score, achievement_standard_id, page, answer_bbox").eq("worksheet_id", worksheetId).order("question_number"),
    admin.from("submissions").select("id, image_processing_status, submitted_at, students(display_name, student_number)").eq("worksheet_id", worksheetId).eq("status", "submitted").order("created_at", { ascending: false }),
    admin.from("worksheet_imports").select("id, original_filename").eq("worksheet_id", worksheetId).maybeSingle(),
  ]);

  const content = worksheet.structured_content && typeof worksheet.structured_content === "object" ? worksheet.structured_content as Record<string, unknown> : {};
  const contentWorksheet = content.worksheet && typeof content.worksheet === "object" ? content.worksheet as Record<string, unknown> : {};
  const contentQuestions = Array.isArray(content.questions) ? content.questions as Array<Record<string, unknown>> : [];
  const aiGenerated = content.generation && typeof content.generation === "object" && (content.generation as Record<string, unknown>).provider === "upstage";
  const initial = {
    title: worksheet.title,
    curriculumGrade: typeof contentWorksheet.curriculum_grade === "number" ? contentWorksheet.curriculum_grade : undefined,
    gradeBand: worksheet.grade_band,
    semester: worksheet.semester,
    area: worksheet.area,
    unitName: worksheet.unit_name,
    lessonObjective: worksheet.lesson_objective,
    totalPages: worksheet.total_pages,
    worksheetStandardIds: worksheetStandards?.map((item) => item.achievement_standard_id) ?? [],
    questions: (questions ?? []).map((question, index) => ({ type: question.type, category: contentQuestions[index]?.category === "word_problem" ? "word_problem" as const : question.type, questionText: question.question_text, answer: question.answer, explanation: question.explanation, score: Number(question.score), achievementStandardId: question.achievement_standard_id, page: question.page, answerBBox: question.answer_bbox as { x: number; y: number; width: number; height: number } | null })),
    generationSource: worksheet.generation_source as "manual" | "mock" | "pdf_import",
  };

  return (
    <section>
      <p><Link href="/teacher/worksheets">← 활동지 목록</Link></p>
      <div className="section-heading"><div><h1>{worksheet.title}</h1><p className="muted">{worksheet.status === "published" ? `발행 v${worksheet.version_number}` : "초안"}{aiGenerated ? " · Upstage AI 생성" : ""}</p></div><Link className="button-link" href={`/teacher/worksheets/${worksheet.id}/print`}>{worksheet.status === "published" ? "인쇄용 PDF" : "인쇄 미리보기"}</Link></div>
      {error ? <p className="danger" role="alert">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}
      {worksheet.status === "draft" ? <form action={publishWorksheet} className="card"><input type="hidden" name="worksheetId" value={worksheet.id} /><p>발행하면 학생 개인정보가 없는 전용 QR과 인쇄용 PDF를 사용할 수 있습니다.</p><button type="submit">활동지 발행</button></form> : <div className="card"><p>QR 토큰은 발행된 활동지 전용입니다. 수정 후에는 초안으로 전환되며 다시 발행해야 합니다.</p><code>/submit/{worksheet.worksheet_token}</code></div>}
      {pdfImport ? <p className="muted">원본: <Link href={`/teacher/worksheets/import/${pdfImport.id}`}>{pdfImport.original_filename}</Link></p> : null}
      {standards?.length ? <WorksheetEditor action={saveWorksheet} worksheetId={worksheet.id} standards={standards} initial={initial} /> : null}
      <section className="card"><h2>학생 제출물</h2>{submissions?.length ? <ul className="list">{submissions.map((submission) => {
        const student = submission.students?.[0];
        return <li className="list-item" key={submission.id}><span><strong>{student?.display_name ?? "학생"}</strong> {student?.student_number ? `(${student.student_number}번)` : ""}<br /><span className="muted">이미지 처리: {submission.image_processing_status} · 제출 {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString("ko-KR") : "대기"}</span></span><span className="inline-links"><Link href={`/teacher/submissions/${submission.id}`}>원본·답안 확인</Link><Link href="/teacher/review">검토 목록</Link></span></li>;
      })}</ul> : <p className="muted">아직 제출물이 없습니다.</p>}</section>
    </section>
  );
}
