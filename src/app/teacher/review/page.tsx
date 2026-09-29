/* eslint-disable @next/next/no-img-element -- private Storage signed URLs */
import Link from "next/link";

import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

import { saveTeacherReview } from "./actions";

type PageProps = { searchParams: Promise<{ error?: string; notice?: string }> };

export const dynamic = "force-dynamic";

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

export default async function TeacherReviewPage({ searchParams }: PageProps) {
  const teacher = await requireTeacher();
  const { error, notice } = await searchParams;
  const admin = createSupabaseAdminClient();
  const { data: submissions } = await admin
    .from("submissions")
    .select("id, worksheet_id, student_id, students(display_name, student_number), worksheets!inner(teacher_id)")
    .eq("worksheets.teacher_id", teacher.id)
    .eq("status", "submitted");
  const submissionById = new Map((submissions ?? []).map((submission) => [submission.id, submission]));
  const submissionIds = [...submissionById.keys()];
  const { data: pages } = submissionIds.length
    ? await admin.from("submission_pages").select("id, submission_id").in("submission_id", submissionIds)
    : { data: [] };
  const pageToSubmission = new Map((pages ?? []).map((page) => [page.id, page.submission_id]));
  const pageIds = [...pageToSubmission.keys()];
  const { data: answers } = pageIds.length
    ? await admin
      .from("submission_answers")
      .select("id, submission_page_id, answer_storage_path, recognized_text, recognition_confidence, recognition_engine, recognition_error, worksheet_questions(question_number, question_text, answer, score)")
      .in("submission_page_id", pageIds)
    : { data: [] };
  const answerIds = (answers ?? []).map((answer) => answer.id);
  const [{ data: aiResults }, { data: finalResults }] = await Promise.all([
    answerIds.length
      ? admin.from("ai_grading_results").select("submission_answer_id, predicted_result, confidence, reasoning_summary, needs_teacher_review, grading_status, grading_strategy, model_name").in("submission_answer_id", answerIds)
      : Promise.resolve({ data: [] }),
    answerIds.length
      ? admin.from("final_grading_results").select("submission_answer_id").in("submission_answer_id", answerIds)
      : Promise.resolve({ data: [] }),
  ]);
  const aiByAnswerId = new Map((aiResults ?? []).map((result) => [result.submission_answer_id, result]));
  const finalizedIds = new Set((finalResults ?? []).map((result) => result.submission_answer_id));
  const reviewItems = (answers ?? []).filter((answer) => aiByAnswerId.get(answer.id)?.needs_teacher_review && !finalizedIds.has(answer.id));
  const imageUrls = await Promise.all(reviewItems.map(async (answer) => {
    const { data } = await admin.storage.from("submission-processed").createSignedUrl(answer.answer_storage_path, 60 * 10);
    return [answer.id, data?.signedUrl ?? null] as const;
  }));
  const imageUrlByAnswer = new Map(imageUrls);

  return (
    <section>
      <div className="section-heading"><div><h1>교사 검토</h1><p className="muted">AI가 교사 확인이 필요하다고 판단한 답안만 표시합니다.</p></div><span className="review-count">검토 {reviewItems.length}개</span></div>
      {error ? <p className="danger" role="alert">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}
      {reviewItems.length ? <div className="review-list">{reviewItems.map((answer) => {
        const ai = aiByAnswerId.get(answer.id)!;
        const submission = submissionById.get(pageToSubmission.get(answer.submission_page_id) ?? "");
        const student = first(submission?.students);
        const question = first(answer.worksheet_questions);
        const confidence = Math.round(Number(ai.confidence) * 100);
        return <article className="card teacher-review-card" key={answer.id}>
          <div className="review-card-heading"><div><h2>{student?.display_name ?? "학생"} {student?.student_number ? `· ${student.student_number}번` : ""}</h2><p className="muted">{question?.question_number}번 · {submission ? <Link href={`/teacher/submissions/${submission.id}`}>제출물 전체 보기</Link> : "제출물"}</p></div><span className="status-badge review">REVIEW_REQUIRED</span></div>
          <div className="teacher-review-content">
            <div><h3>학생 실제 답안 이미지</h3>{imageUrlByAnswer.get(answer.id) ? <img src={imageUrlByAnswer.get(answer.id)!} alt={`${question?.question_number}번 학생 답안`} /> : <p className="danger">답안 이미지를 불러오지 못했습니다.</p>}</div>
            <div className="review-details"><h3>문항과 자동 판단</h3><p><strong>문항</strong><br />{question?.question_text}</p><p><strong>OCR 결과</strong><br />{answer.recognized_text || "인식 결과 없음"}</p><p className="muted">인식 confidence: {answer.recognition_confidence ?? "-"} · {answer.recognition_engine}</p>{answer.recognition_error ? <p className="danger">OCR 오류: {answer.recognition_error}</p> : null}<p><strong>정답</strong><br />{question?.answer}</p><p><strong>AI 판단</strong><br />{ai.predicted_result} · confidence {confidence}%</p><p><strong>AI 판단 요약</strong><br />{ai.reasoning_summary}</p><p className="muted">채점 방식: {ai.grading_strategy}{ai.model_name ? ` · ${ai.model_name}` : ""}</p></div>
          </div>
          <form action={saveTeacherReview} className="review-decision-form"><input type="hidden" name="answerId" value={answer.id} /><fieldset><legend>교사 최종 판정</legend><label><input type="radio" name="decision" value="approve" required defaultChecked /> AI 판단 승인 ({ai.predicted_result})</label>{["correct", "partial", "incorrect", "unreadable"].map((result) => <label key={result}><input type="radio" name="decision" value={result} /> {result}</label>)}</fieldset><label>교사 메모 (선택)<textarea name="teacherNote" maxLength={1000} /></label><button type="submit">최종 판정 저장</button></form>
        </article>;
      })}</div> : <section className="card"><h2>검토할 답안이 없습니다.</h2><p className="muted">AI 자동 확정 답안 또는 이미 교사가 확정한 답안은 이 목록에 표시되지 않습니다.</p></section>}
    </section>
  );
}
