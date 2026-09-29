import Link from "next/link";
import { notFound } from "next/navigation";

import { ScoreHistory } from "@/components/score-history";

import { analyticsQuery, loadTeacherAnalytics, parseAnalyticsFilters } from "@/lib/analytics-data";
import { requireTeacher } from "@/lib/auth/teacher";

type PageProps = { params: Promise<{ studentId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

export default async function StudentAnalyticsDetailPage({ params, searchParams }: PageProps) {
  const teacher = await requireTeacher();
  const { studentId } = await params;
  const filters = { ...parseAnalyticsFilters(await searchParams), studentId };
  const analytics = await loadTeacherAnalytics(teacher.id, filters);
  const metric = analytics.studentMetrics.find((item) => item.student.id === studentId);
  if (!metric) notFound();
  const backQuery = analyticsQuery({ ...filters, studentId: undefined });

  return <section><p className="back-link"><Link href={`/teacher/analytics${backQuery ? `?${backQuery}` : ""}`}>← 학습 분석</Link></p><div className="section-heading page-title"><div><span className="eyebrow">STUDENT PROGRESS</span><h1>{metric.student.studentNumber}번 {metric.student.displayName}</h1><p className="muted">성취기준별 배움의 변화를 시간순으로 살펴보세요.</p></div></div><section className="card"><h2>성취기준별 성장 기록</h2>{metric.standards.length ? <div className="table-wrap"><table><thead><tr><th>성취기준</th><th>최근 결과</th><th>수준</th><th>변화</th><th>시간순 기록</th></tr></thead><tbody>{metric.standards.map((item) => <tr key={item.standard.id}><td>[{item.standard.code}] {item.standard.description}</td><td>{item.current}%</td><td>{item.level}</td><td>{item.trend}</td><td><ScoreHistory points={item.history} /></td></tr>)}</tbody></table></div> : <p className="muted">아직 확인된 결과가 없습니다.</p>}</section><section className="card"><h2>최근 활동지</h2>{metric.recentSubmissions.length ? <ul className="list">{metric.recentSubmissions.map((submission) => <li className="list-item" key={submission.id}><span>{submission.submittedAt ? new Date(submission.submittedAt).toLocaleString("ko-KR") : "제출 시각 없음"}</span><Link href={`/teacher/submissions/${submission.id}`}>제출물 보기 →</Link></li>)}</ul> : <p className="muted">제출 기록이 없습니다.</p>}</section>{metric.repeatedIncorrect.length ? <section className="card"><h2>다시 살펴볼 성취기준</h2><ul>{metric.repeatedIncorrect.map((item) => <li key={item.standard.id}>[{item.standard.code}] {item.standard.description}: {item.count}회</li>)}</ul></section> : null}</section>;
}
