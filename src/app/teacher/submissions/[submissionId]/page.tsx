/* eslint-disable @next/next/no-img-element -- private Storage signed URLs */
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ submissionId: string }> };

export const dynamic = "force-dynamic";

async function signedUrl(path: string | null) {
  if (!path) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin.storage.from("submission-processed").createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

export default async function TeacherSubmissionDetailPage({ params }: PageProps) {
  const teacher = await requireTeacher();
  const { submissionId } = await params;
  const admin = createSupabaseAdminClient();
  const { data: submission } = await admin
    .from("submissions")
    .select("id, worksheet_id, image_processing_status, image_processing_error, submitted_at, worksheets!inner(title, teacher_id), students(display_name, student_number)")
    .eq("id", submissionId)
    .eq("worksheets.teacher_id", teacher.id)
    .maybeSingle();
  if (!submission) notFound();
  const worksheet = submission.worksheets[0];
  const student = submission.students?.[0];

  const { data: pages } = await admin
    .from("submission_pages")
    .select("id, page_number, original_storage_path, processed_storage_path, applied_transforms, submission_answers(id, crop_source, crop_bbox, recognized_text, recognition_confidence, recognition_engine, recognition_error, answer_storage_path, worksheet_questions(question_number, question_text))")
    .eq("submission_id", submission.id)
    .order("page_number");

  const pageViews = await Promise.all((pages ?? []).map(async (page) => ({
    ...page,
    originalUrl: (await admin.storage.from("submission-originals").createSignedUrl(page.original_storage_path, 60 * 10)).data?.signedUrl ?? null,
    processedUrl: await signedUrl(page.processed_storage_path),
    answers: await Promise.all((page.submission_answers ?? []).map(async (answer) => ({
      ...answer,
      question: answer.worksheet_questions?.[0],
      imageUrl: await signedUrl(answer.answer_storage_path),
    }))),
  })));

  return (
    <section>
      <p><Link href={`/teacher/worksheets/${submission.worksheet_id}`}>← 활동지 제출 목록</Link></p>
      <h1>{worksheet?.title ?? "활동지"} 제출물</h1>
      <p className="muted">{student?.display_name ?? "학생"} {student?.student_number ? `· ${student.student_number}번` : ""} · 처리 상태: {submission.image_processing_status}</p>
      {submission.image_processing_error ? <p className="danger">처리 오류: {submission.image_processing_error}</p> : null}
      {pageViews.map((page) => <section className="card processed-page" key={page.id}>
        <h2>{page.page_number}페이지</h2>
        <div className="processed-images"><div><h3>학생 원본</h3>{page.originalUrl ? <img src={page.originalUrl} alt={`${page.page_number}페이지 학생 원본`} /> : <p className="danger">원본을 불러오지 못했습니다.</p>}</div><div><h3>보정 처리본</h3>{page.processedUrl ? <img src={page.processedUrl} alt={`${page.page_number}페이지 보정 처리본`} /> : <p className="muted">처리 대기 또는 실패</p>}</div></div>
        <details><summary>적용 처리 단계</summary><pre>{JSON.stringify(page.applied_transforms, null, 2)}</pre></details>
        <h3>문항 답안 이미지와 인식 결과</h3>
        {page.answers.length ? <div className="answer-review-grid">{page.answers.map((answer) => <article className="answer-review" key={answer.id}><h4>{answer.question?.question_number}번</h4><p className="muted">{answer.question?.question_text}</p>{answer.imageUrl ? <img src={answer.imageUrl} alt={`${answer.question?.question_number}번 답안`} /> : null}<p>OCR: <strong>{answer.recognized_text || "인식 결과 없음"}</strong></p><p className="muted">confidence: {answer.recognition_confidence ?? "-"} · {answer.recognition_engine} · {answer.crop_source === "template_bbox" ? "템플릿 답안 영역" : "페이지 전체 임시 crop"}</p>{answer.recognition_error ? <p className="danger">OCR 오류: {answer.recognition_error}</p> : null}</article>)}</div> : <p className="muted">이 페이지의 문항 답안은 아직 추출되지 않았습니다.</p>}
      </section>)}
    </section>
  );
}
