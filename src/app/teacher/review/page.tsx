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

function resultLabel(result: string) {
  return ({ correct: "정답", partial: "부분 정답", incorrect: "오답", unreadable: "읽기 어려움" } as Record<string, string>)[result] ?? "확인 필요";
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
      <div className="section-heading page-title"><div><span className="eyebrow">ANSWER REVIEW</span><h1>답안 검토</h1><p className="muted">선생님의 확인이 필요한 답안만 모았습니다.</p></div><span className="review-count">확인할 답안 {reviewItems.length}개</span></div>
      {error ? <p className="danger" role="alert">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}
      {reviewItems.length ? <div className="review-list">{reviewItems.map((answer) => {
        const ai = aiByAnswerId.get(answer.id)!;
        const submission = submissionById.get(pageToSubmission.get(answer.submission_page_id) ?? "");
        const student = first(submission?.students);
        const question = first(answer.worksheet_questions);
        const confidence = Math.round(Number(ai.confidence) * 100);
        return <article className="card teacher-review-card" key={answer.id}>
          <div className="review-card-heading"><div><h2>{student?.display_name ?? "학생"} {student?.student_number ? `· ${student.student_number}번` : ""}</h2><p className="muted">{question?.question_number}번 문항 · {submission ? <Link href={`/teacher/submissions/${submission.id}`}>제출물 전체 보기</Link> : "제출물"}</p></div><span className="status-badge review">선생님 확인 필요</span></div>
          <div className="teacher-review-content">
            <div><h3>학생이 쓴 답안</h3>{imageUrlByAnswer.get(answer.id) ? <img src={imageUrlByAnswer.get(answer.id)!} alt={`${question?.question_number}번 학생 답안`} /> : <p className="danger">답안 이미지를 불러오지 못했습니다.</p>}</div>
            <div className="review-details"><h3>문항과 채점 내용</h3><p><strong>문항</strong><br />{question?.question_text}</p><p><strong>사진에서 읽은 답</strong><br />{answer.recognized_text || "읽은 답이 없습니다."}</p><p className="muted">글자 읽기 확실도: {answer.recognition_confidence === null ? "확인 중" : `${Math.round(Number(answer.recognition_confidence) * 100)}%`}</p>{answer.recognition_error ? <p className="danger">답안을 읽지 못했습니다. 사진을 확인해 주세요.</p> : null}<p><strong>정답</strong><br />{question?.answer}</p><p><strong>자동 채점</strong><br />{resultLabel(ai.predicted_result)} · 채점 확실도 {confidence}%</p><p><strong>판단 이유</strong><br />{ai.reasoning_summary}</p></div>
          </div>
          <form action={saveTeacherReview} className="review-decision-form"><input type="hidden" name="answerId" value={answer.id} /><fieldset><legend>최종 결과를 선택해 주세요</legend><label><input type="radio" name="decision" value="approve" required defaultChecked /> 자동 채점대로 ({resultLabel(ai.predicted_result)})</label>{["correct", "partial", "incorrect", "unreadable"].map((result) => <label key={result}><input type="radio" name="decision" value={result} /> {resultLabel(result)}</label>)}</fieldset><label>메모 (선택)<textarea name="teacherNote" maxLength={1000} /></label><button type="submit">결과 저장하기</button></form>
        </article>;
      })}</div> : <section className="card empty-state"><span aria-hidden>✓</span><h2>지금 확인할 답안이 없어요.</h2><p className="muted">새로 확인이 필요한 답안이 생기면 이곳에 모아 보여드릴게요.</p></section>}
    </section>
  );
}
