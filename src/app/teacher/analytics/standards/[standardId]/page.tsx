import Link from "next/link";
import { notFound } from "next/navigation";

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
  return <section><p><Link href={`/teacher/analytics${backQuery ? `?${backQuery}` : ""}`}>← 분석 대시보드</Link></p><h1>[{standard.code}] 성취기준 분석</h1><p className="muted">{standard.description}</p><section className="card"><h2>학생별 현재 수준과 시간순 기록</h2><div className="table-wrap"><table><thead><tr><th>학생</th><th>최근 결과</th><th>수준</th><th>추이</th><th>기록</th><th /></tr></thead><tbody>{analytics.studentMetrics.map((studentMetric) => { const standardMetric = studentMetric.standards.find((item) => item.standard.id === standardId); return <tr key={studentMetric.student.id}><td>{studentMetric.student.studentNumber}번 {studentMetric.student.displayName}</td><td>{standardMetric?.current === undefined ? "기록 없음" : `${standardMetric.current}%`}</td><td>{standardMetric?.level ?? "-"}</td><td>{standardMetric?.trend ?? "-"}</td><td>{standardMetric?.history.map((item) => `${item.scoreRate}%`).join(" → ") ?? "-"}</td><td><Link href={`/teacher/analytics/students/${studentMetric.student.id}${backQuery ? `?${backQuery}` : ""}`}>학생 상세</Link></td></tr>; })}</tbody></table></div></section></section>;
}
