import Link from "next/link";
import { notFound } from "next/navigation";

import { ScoreHistory } from "@/components/score-history";

import { analyticsQuery, loadTeacherAnalytics, parseAnalyticsFilters } from "@/lib/analytics-data";
import { requireTeacher } from "@/lib/auth/teacher";

type PageProps = { params: Promise<{ standardId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

export default async function StandardAnalyticsDetailPage({ params, searchParams }: PageProps) {
  const teacher = await requireTeacher();
  const { standardId } = await params;
  const originalFilters = parseAnalyticsFilters(await searchParams);
  const analytics = await loadTeacherAnalytics(teacher.id, { ...originalFilters, standardId });
  const standard = analytics.allStandards.find((item) => item.id === standardId);
  if (!standard) notFound();
  const backQuery = analyticsQuery(originalFilters);
  return <section><p className="back-link"><Link href={`/teacher/analytics${backQuery ? `?${backQuery}` : ""}`}>← 학습 분석</Link></p><div className="section-heading page-title"><div><span className="eyebrow">ACHIEVEMENT STANDARD</span><h1>[{standard.code}] 성취기준</h1><p className="muted">{standard.description}</p></div></div><section className="card"><h2>학생별 성장 흐름</h2><div className="table-wrap"><table><thead><tr><th>학생</th><th>최근 결과</th><th>수준</th><th>변화</th><th>시간순 기록</th><th /></tr></thead><tbody>{analytics.studentMetrics.map((studentMetric) => { const standardMetric = studentMetric.standards.find((item) => item.standard.id === standardId); return <tr key={studentMetric.student.id}><td>{studentMetric.student.studentNumber}번 {studentMetric.student.displayName}</td><td>{standardMetric?.current === undefined ? "기록 없음" : `${standardMetric.current}%`}</td><td>{standardMetric?.level ?? "-"}</td><td>{standardMetric?.trend ?? "-"}</td><td><ScoreHistory points={standardMetric?.history ?? []} /></td><td><Link href={`/teacher/analytics/students/${studentMetric.student.id}${backQuery ? `?${backQuery}` : ""}`}>학생 기록 →</Link></td></tr>; })}</tbody></table></div></section></section>;
}
