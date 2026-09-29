import Link from "next/link";
import { notFound } from "next/navigation";

import { analyticsQuery, loadTeacherAnalytics, parseAnalyticsFilters } from "@/lib/analytics-data";
import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ questionId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

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

  return <section><p><Link href={`/teacher/analytics${backQuery ? `?${backQuery}` : ""}`}>← 분석 대시보드</Link></p><h1>{metric.question.questionNumber}번 문항 분석</h1><section className="card"><p>{metric.question.questionText}</p><dl className="summary-stats"><div><dt>응답</dt><dd>{metric.responseCount}</dd></div><div><dt>정답률</dt><dd>{metric.accuracy ?? "채점 대기"}{metric.accuracy === null ? "" : "%"}</dd></div><div><dt>득점률</dt><dd>{metric.scoreRate ?? "채점 대기"}{metric.scoreRate === null ? "" : "%"}</dd></div></dl></section><section className="card"><h2>학생별 결과</h2>{results.length ? <div className="table-wrap"><table><thead><tr><th>학생</th><th>결과</th><th>획득 점수</th><th>출처</th><th>제출</th></tr></thead><tbody>{results.map(({ answer, submission }) => { const student = studentsById.get(submission!.studentId); return <tr key={`${answer.submissionId}:${answer.questionId}`}><td>{student ? `${student.studentNumber}번 ${student.displayName}` : "학생"}</td><td>{answer.result}</td><td>{answer.scoreAwarded} / {metric.question.score}</td><td>{answer.source === "teacher" ? "교사 확정" : "자동 확정"}</td><td><Link href={`/teacher/submissions/${submission!.id}`}>답안 보기</Link></td></tr>; })}</tbody></table></div> : <p className="muted">확정된 결과가 없습니다.</p>}</section></section>;
}
