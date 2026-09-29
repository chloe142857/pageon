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

  return (
    <section>
      <div className="section-heading"><div><h1>분석 대시보드</h1><p className="muted">활동지별 학급 결과와 성취기준별 성장 기록을 확인합니다. 학생 전체 활동지 평균은 사용하지 않습니다.</p></div></div>
      <form method="get" className="card analytics-filter">
        <h2>분석 범위</h2>
        <div className="filter-grid">
          <label>학급<select name="classroomId" defaultValue={filters.classroomId ?? ""}><option value="">전체 학급</option>{analytics.classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name} {classroom.school_year ? `(${classroom.school_year})` : ""}</option>)}</select></label>
          <label>학생<select name="studentId" defaultValue={filters.studentId ?? ""}><option value="">전체 학생</option>{analytics.allStudents.filter((student) => !filters.classroomId || student.classroom_id === filters.classroomId).map((student) => <option key={student.id} value={student.id}>{student.student_number}번 {student.display_name}</option>)}</select></label>
          <label>학년군<select name="gradeBand" defaultValue={filters.gradeBand ?? ""}><option value="">전체</option>{[...new Set(analytics.allWorksheets.map((worksheet) => worksheet.grade_band))].map((gradeBand) => <option key={gradeBand} value={gradeBand}>{gradeBand}</option>)}</select></label>
          <label>학기<select name="semester" defaultValue={filters.semester ?? ""}><option value="">전체</option>{[...new Set(analytics.allWorksheets.map((worksheet) => worksheet.semester))].map((semester) => <option key={semester} value={semester}>{semester}</option>)}</select></label>
          <label>영역<select name="area" defaultValue={filters.area ?? ""}><option value="">전체</option>{[...new Set(analytics.allWorksheets.map((worksheet) => worksheet.area).filter(Boolean))].map((area) => <option key={area} value={area}>{area}</option>)}</select></label>
          <label>단원<select name="unitName" defaultValue={filters.unitName ?? ""}><option value="">전체</option>{[...new Set(analytics.allWorksheets.map((worksheet) => worksheet.unit_name).filter(Boolean))].map((unitName) => <option key={unitName} value={unitName}>{unitName}</option>)}</select></label>
          <label>성취기준<select name="standardId" defaultValue={filters.standardId ?? ""}><option value="">전체</option>{analytics.allStandards.map((standard) => <option key={standard.id} value={standard.id}>[{standard.code}] {standard.description}</option>)}</select></label>
          <label>활동지<select name="worksheetId" defaultValue={filters.worksheetId ?? ""}><option value="">전체 활동지</option>{analytics.allWorksheets.map((worksheet) => <option key={worksheet.id} value={worksheet.id}>{worksheet.title}</option>)}</select></label>
          <label>시작일<input name="from" type="date" defaultValue={filters.from ?? ""} /></label>
          <label>종료일<input name="to" type="date" defaultValue={filters.to ?? ""} /></label>
        </div>
        <div className="capture-actions"><button type="submit">분석하기</button><Link className="button-link secondary-link" href="/teacher/analytics">필터 초기화</Link></div>
      </form>

      <section className="card"><h2>활동지 중심 분석</h2>{selectedActivities.length ? <div className="analytics-cards">{selectedActivities.map((activity) => <article className="analytics-card" key={activity.worksheet.id}><h3>{activity.worksheet.title}</h3><p className="muted">{activity.worksheet.gradeBand} · {activity.worksheet.semester} · {activity.worksheet.area || "영역 미입력"}</p><dl><div><dt>제출</dt><dd>{activity.submittedCount}명</dd></div><div><dt>채점 완료</dt><dd>{activity.scoredCount}명</dd></div><div><dt>학급 평균</dt><dd>{percent(activity.classMean)}</dd></div><div><dt>중앙값</dt><dd>{percent(activity.median)}</dd></div></dl><p className="muted">점수 분포: {activity.distribution.map((item) => `${item.label}점 ${item.count}명`).join(" · ")}</p>{activity.missingStudents ? <div><strong>미제출 {activity.missingStudents.length}명</strong><p className="muted">{activity.missingStudents.length ? activity.missingStudents.map((student) => `${student.studentNumber}번 ${student.displayName}`).join(", ") : "없음"}</p></div> : filters.worksheetId ? <p className="muted">미제출은 학급을 선택하면 계산합니다.</p> : null}<Link href={`/teacher/worksheets/${activity.worksheet.id}`}>활동지 제출물 보기</Link></article>)}</div> : <p className="muted">선택한 조건에 맞는 활동지가 없습니다.</p>}</section>

      <section className="card"><div className="section-heading"><div><h2>문항 분석</h2><p className="muted">정답률과 배점 기준 득점률이 낮은 문항부터 표시합니다.</p></div></div>{analytics.questionMetrics.length ? <div className="table-wrap"><table><thead><tr><th>문항</th><th>응답</th><th>정답률</th><th>득점률</th><th /></tr></thead><tbody>{analytics.questionMetrics.map((metric) => <tr key={metric.question.id}><td>{metric.question.questionNumber}번 · {metric.question.questionText.slice(0, 46)}</td><td>{metric.responseCount}</td><td>{percent(metric.accuracy)}</td><td>{percent(metric.scoreRate)}</td><td><Link href={`/teacher/analytics/questions/${metric.question.id}${query ? `?${query}` : ""}`}>자세히</Link></td></tr>)}</tbody></table></div> : <p className="muted">확정 또는 자동 확정된 문항 결과가 없습니다.</p>}</section>

      <section className="card"><h2>성취기준 결과</h2>{analytics.standardMetrics.length ? <div className="table-wrap"><table><thead><tr><th>성취기준</th><th>응답</th><th>득점률</th><th>수준</th><th /></tr></thead><tbody>{analytics.standardMetrics.map((metric) => <tr key={metric.standard.id}><td>[{metric.standard.code}] {metric.standard.description}</td><td>{metric.responseCount}</td><td>{percent(metric.scoreRate)}</td><td>{metric.level}</td><td><Link href={`/teacher/analytics/standards/${metric.standard.id}${query ? `?${query}` : ""}`}>학생별 보기</Link></td></tr>)}</tbody></table></div> : <p className="muted">표시할 성취기준 결과가 없습니다.</p>}</section>

      <section className="card"><h2>학생 중심 분석</h2>{analytics.studentMetrics.length ? <div className="student-analytics-grid">{analytics.studentMetrics.map((metric) => <article className="student-analytics-card" key={metric.student.id}><h3>{metric.student.studentNumber}번 {metric.student.displayName}</h3><p className="muted">최근 제출 {metric.recentSubmissions.length}건</p><p>성취기준: {metric.standards.length ? metric.standards.map((item) => `${item.standard.code} ${item.current}% (${item.level}, ${item.trend})`).join(" · ") : "채점 완료 기록 없음"}</p>{metric.repeatedIncorrect.length ? <p className="danger">반복 오답: {metric.repeatedIncorrect.map((item) => `${item.standard.code} ${item.count}회`).join(", ")}</p> : null}<Link href={`/teacher/analytics/students/${metric.student.id}${query ? `?${query}` : ""}`}>학생 상세</Link></article>)}</div> : <p className="muted">표시할 학생이 없습니다.</p>}</section>
    </section>
  );
}
