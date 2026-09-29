import Link from "next/link";
import { notFound } from "next/navigation";

import { analyticsQuery, loadTeacherAnalytics, parseAnalyticsFilters } from "@/lib/analytics-data";
import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ questionId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const resultLabels = { correct: "정답", partial: "부분 정답", incorrect: "오답", unreadable: "읽기 어려움" } as const;

export const dynamic = "force-dynamic";

export default async function QuestionAnalyticsDetailPage({ params, searchParams }: PageProps) {
  const teacher = await requireTeacher();
  const { questionId } = await params;
  const admin = createSupabaseAdminClient();
  const { data: ownedQuestion } = await admin.from("worksheet_questions").select("id, worksheet_id, worksheets!inner(teacher_id)").eq("id", questionId).eq("worksheets.teacher_id", teacher.id).maybeSingle();
  if (!ownedQuestion) notFound();
  const originalFilters = parseAnalyticsFilters(await searchParams);
  const analytics = await loadTeacherAnalytics(teacher.id, { ...originalFilters, worksheetId: ownedQuestion.worksheet_id });
  const metric = analytics.questionMetrics.find((item) => item.question.id === questionId);
  if (!metric) notFound();
  const studentsById = new Map(analytics.raw.students.map((student) => [student.id, student]));
  const submissionsById = new Map(analytics.raw.submissions.map((submission) => [submission.id, submission]));
  const results = analytics.raw.answers.filter((answer) => answer.questionId === questionId).map((answer) => ({ answer, submission: submissionsById.get(answer.submissionId) })).filter((item) => item.submission);
  const backQuery = analyticsQuery(originalFilters);

  return <section><p className="back-link"><Link href={`/teacher/analytics${backQuery ? `?${backQuery}` : ""}`}>← 학습 분석</Link></p><div className="section-heading page-title"><div><span className="eyebrow">QUESTION DETAILS</span><h1>{metric.question.questionNumber}번 문항</h1><p className="muted">학생들이 이 문항을 어떻게 풀었는지 살펴보세요.</p></div></div><section className="card"><p>{metric.question.questionText}</p><dl className="summary-stats"><div><dt>응답</dt><dd>{metric.responseCount}</dd></div><div><dt>정답률</dt><dd>{metric.accuracy ?? "채점 대기"}{metric.accuracy === null ? "" : "%"}</dd></div><div><dt>득점률</dt><dd>{metric.scoreRate ?? "채점 대기"}{metric.scoreRate === null ? "" : "%"}</dd></div></dl></section><section className="card"><h2>학생별 결과</h2>{results.length ? <div className="table-wrap"><table><thead><tr><th>학생</th><th>결과</th><th>획득 점수</th><th>확인</th><th>제출</th></tr></thead><tbody>{results.map(({ answer, submission }) => { const student = studentsById.get(submission!.studentId); return <tr key={`${answer.submissionId}:${answer.questionId}`}><td>{student ? `${student.studentNumber}번 ${student.displayName}` : "학생"}</td><td>{resultLabels[answer.result]}</td><td>{answer.scoreAwarded} / {metric.question.score}</td><td>{answer.source === "teacher" ? "선생님 확인" : "자동 확인"}</td><td><Link href={`/teacher/submissions/${submission!.id}`}>답안 보기</Link></td></tr>; })}</tbody></table></div> : <p className="muted">확인된 결과가 없습니다.</p>}</section></section>;
}
