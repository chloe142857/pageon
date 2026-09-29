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
    .select("id, page_number, original_storage_path, processed_storage_path, submission_answers(id, crop_source, recognized_text, recognition_confidence, recognition_error, answer_storage_path, worksheet_questions(question_number, question_text))")
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
      <p className="back-link"><Link href={`/teacher/worksheets/${submission.worksheet_id}`}>← 활동지 제출 목록</Link></p>
      <div className="section-heading page-title"><div><span className="eyebrow">STUDENT WORK</span><h1>{worksheet?.title ?? "활동지"} 제출물</h1><p className="muted">{student?.display_name ?? "학생"} {student?.student_number ? `· ${student.student_number}번` : ""} · {submission.image_processing_status === "completed" ? "답안을 확인할 수 있어요" : submission.image_processing_status === "failed" ? "사진 확인이 필요해요" : "사진을 확인하고 있어요"}</p></div></div>
      {submission.image_processing_error ? <p className="danger">사진을 처리하는 중 문제가 생겼습니다. 원본 사진을 확인해 주세요.</p> : null}
      {pageViews.map((page) => <section className="card processed-page" key={page.id}>
        <h2>{page.page_number}페이지</h2>
        <div className="processed-images"><div><h3>학생이 찍은 사진</h3>{page.originalUrl ? <img src={page.originalUrl} alt={`${page.page_number}페이지 학생 원본`} /> : <p className="danger">원본을 불러오지 못했습니다.</p>}</div><div><h3>읽기 좋게 다듬은 사진</h3>{page.processedUrl ? <img src={page.processedUrl} alt={`${page.page_number}페이지 보정 처리본`} /> : <p className="muted">사진을 준비하고 있어요.</p>}</div></div>
        <h3>문항별 답안</h3>
        {page.answers.length ? <div className="answer-review-grid">{page.answers.map((answer) => <article className="answer-review" key={answer.id}><h4>{answer.question?.question_number}번</h4><p className="muted">{answer.question?.question_text}</p>{answer.imageUrl ? <img src={answer.imageUrl} alt={`${answer.question?.question_number}번 답안`} /> : null}<p>읽은 답: <strong>{answer.recognized_text || "아직 읽은 답이 없어요"}</strong></p><p className="muted">읽기 확실도: {answer.recognition_confidence === null ? "확인 중" : `${Math.round(Number(answer.recognition_confidence) * 100)}%`} · {answer.crop_source === "template_bbox" ? "답안 부분" : "사진 전체"} 확인</p>{answer.recognition_error ? <p className="danger">글씨를 읽기 어려워요. 사진을 직접 확인해 주세요.</p> : null}</article>)}</div> : <p className="muted">이 페이지의 답안을 확인하고 있어요.</p>}
      </section>)}
    </section>
  );
}
