import Link from "next/link";
import { notFound } from "next/navigation";

import { WorksheetEditor } from "@/components/worksheet-editor";
import { WorksheetFlow } from "@/components/worksheet-flow";
import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { geometryDiagramKinds, type GeometryDiagram } from "@/lib/worksheet";

import { publishWorksheet, reflowWorksheetPages, saveWorksheet } from "../actions";

type PageProps = { params: Promise<{ worksheetId: string }>; searchParams: Promise<{ error?: string; notice?: string }> };

function isGeometryDiagram(value: unknown): value is GeometryDiagram {
  return Boolean(value && typeof value === "object" && geometryDiagramKinds.includes((value as GeometryDiagram).kind) && Array.isArray((value as GeometryDiagram).labels));
}

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
    admin.from("worksheet_questions").select("type, question_text, answer, explanation, score, page, answer_bbox").eq("worksheet_id", worksheetId).order("question_number"),
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
    questions: (questions ?? []).map((question, index) => ({ type: question.type, category: contentQuestions[index]?.category === "word_problem" ? "word_problem" as const : question.type, questionText: question.question_text, answer: question.answer, explanation: question.explanation, score: Number(question.score), page: question.page, answerBBox: question.answer_bbox as { x: number; y: number; width: number; height: number } | null, diagram: isGeometryDiagram(contentQuestions[index]?.diagram) ? contentQuestions[index].diagram : null })),
    generationSource: worksheet.generation_source as "manual" | "mock" | "pdf_import",
  };

  return (
    <section>
      <p className="back-link"><Link href="/teacher/worksheets">← 활동지 목록</Link></p>
      <WorksheetFlow current={worksheet.status === "published" ? 3 : 2} links={{ 1: "/teacher/worksheets/new" }} />
      <div className="section-heading page-title"><div><span className="eyebrow">WORKSHEET DETAILS</span><h1>{worksheet.title}</h1><p className="muted">{worksheet.status === "published" ? "발행된 활동지" : "작성 중인 활동지"}{aiGenerated ? " · 자동 생성" : ""}</p></div></div>
      {error ? <p className="danger" role="alert">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}
      {worksheet.status === "draft" ? <form action={publishWorksheet} className="card publish-panel"><input type="hidden" name="worksheetId" value={worksheet.id} /><div><h2>활동지 구성을 확인했나요?</h2><p className="muted">문항과 정답을 저장한 뒤 발행하면 학생 제출용 QR이 준비됩니다.</p></div><button type="submit">다음: 활동지 발행하기</button></form> : <div className="card publish-panel"><div><h2>학생에게 나눠줄 준비가 되었어요</h2><p className="muted">마지막 단계에서 QR을 확인하고 인쇄할 수 있어요.</p></div><Link className="button-link" href={`/teacher/worksheets/${worksheet.id}/print`}>다음: 인쇄 미리보기</Link></div>}
      <form action={reflowWorksheetPages} className="inline-reflow"><input type="hidden" name="worksheetId" value={worksheet.id} /><button type="submit" className="text-button">문항을 한 쪽에 10개씩 다시 배치하기</button></form>
      {pdfImport ? <p className="muted">원본: <Link href={`/teacher/worksheets/import/${pdfImport.id}`}>{pdfImport.original_filename}</Link></p> : null}
      <WorksheetEditor action={saveWorksheet} worksheetId={worksheet.id} standards={standards ?? []} initial={initial} />
      <section className="card"><h2>학생 제출물</h2>{submissions?.length ? <ul className="list">{submissions.map((submission) => {
        const student = submission.students?.[0];
        return <li className="list-item" key={submission.id}><span><strong>{student?.display_name ?? "학생"}</strong> {student?.student_number ? `(${student.student_number}번)` : ""}<br /><span className="muted">{submission.image_processing_status === "completed" ? "답안 확인 가능" : submission.image_processing_status === "failed" ? "사진 확인 필요" : "사진 확인 중"} · {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString("ko-KR") : "제출 대기"}</span></span><span className="inline-links"><Link href={`/teacher/submissions/${submission.id}`}>답안 보기</Link><Link href="/teacher/review">검토할 답안</Link></span></li>;
      })}</ul> : <p className="muted">아직 제출물이 없습니다.</p>}</section>
    </section>
  );
}
