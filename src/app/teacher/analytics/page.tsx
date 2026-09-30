import Link from "next/link";

import { analyticsQuery, loadTeacherAnalytics, parseAnalyticsFilters } from "@/lib/analytics-data";
import { requireTeacher } from "@/lib/auth/teacher";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

function percent(value: number | null) {
  return value === null ? "채점 대기" : `${value}%`;
}

export default async function TeacherAnalyticsPage({ searchParams }: PageProps) {
  const teacher = await requireTeacher();
  const filters = parseAnalyticsFilters(await searchParams);
  const analytics = await loadTeacherAnalytics(teacher.id, filters);
  const selectedActivities = filters.worksheetId ? analytics.activitySummaries : analytics.activitySummaries.slice(0, 8);
  const query = analyticsQuery(filters);
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <section>
      <div className="section-heading page-title"><div><span className="eyebrow">LEARNING INSIGHTS</span><h1>학습 분석</h1><p className="muted">학급의 활동지 결과와 학생의 성취기준별 변화를 살펴보세요.</p></div></div>
      <form method="get" className="analytics-filter">
        <details open={hasFilters}>
          <summary><span><strong>분석 범위</strong><small>{hasFilters ? "조건을 적용해 보고 있어요" : "학급·학생·수업 조건으로 좁혀 보기"}</small></span><span className="filter-summary-action">필터 {hasFilters ? "수정" : "열기"}</span></summary>
        <div className="filter-grid">
          <label>학급<select name="classroomId" defaultValue={filters.classroomId ?? ""}><option value="">전체 학급</option>{analytics.classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name} {classroom.school_year ? `(${classroom.school_year})` : ""}</option>)}</select></label>
          <label>학생<select name="studentId" defaultValue={filters.studentId ?? ""}><option value="">전체 학생</option>{analytics.allStudents.filter((student) => !filters.classroomId || student.classroom_id === filters.classroomId).map((student) => <option key={student.id} value={student.id}>{student.student_number}번 {student.display_name}</option>)}</select></label>
          <label>학년<select name="grade" defaultValue={filters.grade ?? ""}><option value="">전체</option>{[...new Set(analytics.allWorksheets.map((worksheet) => {
            const content = worksheet.structured_content && typeof worksheet.structured_content === "object" ? worksheet.structured_content as Record<string, unknown> : {};
            const worksheetContent = content.worksheet && typeof content.worksheet === "object" ? content.worksheet as Record<string, unknown> : {};
            return typeof worksheetContent.curriculum_grade === "number" ? worksheetContent.curriculum_grade : null;
          }).filter((grade): grade is number => grade !== null))].sort((a, b) => a - b).map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}</select></label>
          <label>학기<select name="semester" defaultValue={filters.semester ?? ""}><option value="">전체</option>{[...new Set(analytics.allWorksheets.map((worksheet) => worksheet.semester))].map((semester) => <option key={semester} value={semester}>{semester}</option>)}</select></label>
          <label>영역<select name="area" defaultValue={filters.area ?? ""}><option value="">전체</option>{[...new Set(analytics.allWorksheets.map((worksheet) => worksheet.area).filter(Boolean))].map((area) => <option key={area} value={area}>{area}</option>)}</select></label>
          <label>단원<select name="unitName" defaultValue={filters.unitName ?? ""}><option value="">전체</option>{[...new Set(analytics.allWorksheets.map((worksheet) => worksheet.unit_name).filter(Boolean))].map((unitName) => <option key={unitName} value={unitName}>{unitName}</option>)}</select></label>
          <label>성취기준<select name="standardId" defaultValue={filters.standardId ?? ""}><option value="">전체</option>{analytics.allStandards.map((standard) => <option key={standard.id} value={standard.id}>[{standard.code}] {standard.description}</option>)}</select></label>
          <label>활동지<select name="worksheetId" defaultValue={filters.worksheetId ?? ""}><option value="">전체 활동지</option>{analytics.allWorksheets.map((worksheet) => <option key={worksheet.id} value={worksheet.id}>{worksheet.title}</option>)}</select></label>
          <label>시작일<input name="from" type="date" defaultValue={filters.from ?? ""} /></label>
          <label>종료일<input name="to" type="date" defaultValue={filters.to ?? ""} /></label>
        </div>
        <div className="capture-actions"><button type="submit">분석하기</button><Link className="button-link secondary-link" href="/teacher/analytics">필터 초기화</Link></div>
        </details>
      </form>

      <section className="card"><h2>활동지별 우리 반 결과</h2>{selectedActivities.length ? <div className="analytics-cards">{selectedActivities.map((activity) => {
        const largest = Math.max(1, ...activity.distribution.map((item) => item.count));
        return <article className="analytics-card" key={activity.worksheet.id}>
          <h3>{activity.worksheet.title}</h3><p className="muted">{activity.worksheet.grade ? `${activity.worksheet.grade}학년` : activity.worksheet.gradeBand} · {activity.worksheet.semester} · {activity.worksheet.area || "영역 미입력"}</p>
          <dl><div><dt>제출한 학생</dt><dd>{activity.submittedCount}명</dd></div><div><dt>결과 확인</dt><dd>{activity.scoredCount}명</dd></div><div><dt>학급 평균</dt><dd>{percent(activity.classMean)}</dd></div><div><dt>중앙값</dt><dd>{percent(activity.median)}</dd></div></dl>
          <div className="distribution" aria-label="점수 분포">{activity.distribution.map((item) => <span className="distribution-bar" key={item.label} style={{ height: `${Math.max(4, item.count / largest * 66)}px` }} title={`${item.label}점: ${item.count}명`} />)}</div><div className="distribution-labels">{activity.distribution.map((item) => <span key={item.label}>{item.label}점</span>)}</div>
          {activity.missingStudents ? <p className="muted">미제출 {activity.missingStudents.length}명{activity.missingStudents.length ? ` · ${activity.missingStudents.map((student) => `${student.studentNumber}번 ${student.displayName}`).join(", ")}` : ""}</p> : filters.worksheetId ? <p className="muted">학급을 선택하면 미제출 학생을 볼 수 있어요.</p> : null}
          <Link href={`/teacher/worksheets/${activity.worksheet.id}`}>제출물 살펴보기 →</Link>
        </article>;
      })}</div> : <p className="muted">선택한 조건에 맞는 활동지가 없습니다.</p>}</section>

      <section className="card"><div className="section-heading"><div><h2>어려웠던 문항</h2><p className="muted">정답률이 낮은 문항부터 살펴보세요.</p></div></div>{analytics.questionMetrics.length ? <div className="table-wrap"><table><thead><tr><th>문항</th><th>응답</th><th>정답률</th><th>득점률</th><th /></tr></thead><tbody>{analytics.questionMetrics.map((metric) => <tr key={metric.question.id}><td>{metric.question.questionNumber}번 · {metric.question.questionText.slice(0, 46)}</td><td>{metric.responseCount}</td><td><span className="metric-meter"><span>{percent(metric.accuracy)}</span><span className="metric-meter-track"><i style={{ width: `${metric.accuracy ?? 0}%` }} /></span></span></td><td>{percent(metric.scoreRate)}</td><td><Link href={`/teacher/analytics/questions/${metric.question.id}${query ? `?${query}` : ""}`}>자세히 →</Link></td></tr>)}</tbody></table></div> : <p className="muted">아직 살펴볼 문항 결과가 없습니다.</p>}</section>

      <section className="card"><h2>성취기준별 결과</h2>{analytics.standardMetrics.length ? <div className="table-wrap"><table><thead><tr><th>성취기준</th><th>응답</th><th>득점률</th><th>수준</th><th /></tr></thead><tbody>{analytics.standardMetrics.map((metric) => <tr key={metric.standard.id}><td>[{metric.standard.code}] {metric.standard.description}</td><td>{metric.responseCount}</td><td><span className="metric-meter"><span>{percent(metric.scoreRate)}</span><span className="metric-meter-track"><i style={{ width: `${metric.scoreRate ?? 0}%` }} /></span></span></td><td>{metric.level}</td><td><Link href={`/teacher/analytics/standards/${metric.standard.id}${query ? `?${query}` : ""}`}>학생별 보기 →</Link></td></tr>)}</tbody></table></div> : <p className="muted">표시할 성취기준 결과가 없습니다.</p>}</section>

      <section className="card"><h2>학생별 배움 기록</h2>{analytics.studentMetrics.length ? <div className="student-analytics-grid">{analytics.studentMetrics.map((metric) => <article className="student-analytics-card" key={metric.student.id}><h3>{metric.student.studentNumber}번 {metric.student.displayName}</h3><p className="muted">최근 제출 {metric.recentSubmissions.length}건</p><p>{metric.standards.length ? metric.standards.slice(0, 3).map((item) => `${item.standard.code} ${item.current}% · ${item.level}`).join(" / ") : "아직 확인된 결과가 없어요."}</p>{metric.repeatedIncorrect.length ? <p className="danger">다시 살펴볼 내용: {metric.repeatedIncorrect.map((item) => `${item.standard.code} ${item.count}회`).join(", ")}</p> : null}<Link href={`/teacher/analytics/students/${metric.student.id}${query ? `?${query}` : ""}`}>성장 기록 보기 →</Link></article>)}</div> : <p className="muted">표시할 학생이 없습니다.</p>}</section>
    </section>
  );
}
