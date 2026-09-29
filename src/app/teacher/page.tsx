import Link from "next/link";

import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeacherDashboardPage() {
  const teacher = await requireTeacher();
  const admin = createSupabaseAdminClient();
  const [{ count: classroomCount }, { count: worksheetCount }] = await Promise.all([
    admin.from("classrooms").select("id", { count: "exact", head: true }).eq("teacher_id", teacher.id).is("archived_at", null),
    admin.from("worksheets").select("id", { count: "exact", head: true }).eq("teacher_id", teacher.id),
  ]);

  return (
    <section className="dashboard-page">
      <div className="dashboard-hero">
        <div><span className="eyebrow light">TEACHER WORKSPACE</span><h1>오늘의 수업도,<br />차근차근 준비해요.</h1><p>활동지를 만들고 학생들의 풀이를 살펴보는 일이 한곳에서 이어집니다.</p><Link className="button-link coral-link" href="/teacher/worksheets/new">새 활동지 만들기 <span aria-hidden>↗</span></Link></div>
        <div className="dashboard-hero-graphic" aria-hidden="true"><div className="graphic-ring" /><div className="graphic-sheet sheet-back" /><div className="graphic-sheet sheet-front"><span>수학 활동지</span><i /><i /><i /><strong>✓</strong></div><div className="graphic-pill">배움의 기록</div></div>
      </div>
      <div className="dashboard-section-heading"><div><span className="eyebrow">AT A GLANCE</span><h2>내 수업 현황</h2></div><p>필요한 곳으로 바로 이동할 수 있어요.</p></div>
      <div className="dashboard-stat-grid">
        <Link href="/teacher/classrooms" className="stat-card"><span className="stat-icon teal">▦</span><span className="stat-label">운영 중인 학급</span><strong>{classroomCount ?? 0}<small>개</small></strong><span className="stat-card-link">학급 살펴보기 <span aria-hidden>→</span></span></Link>
        <Link href="/teacher/worksheets" className="stat-card"><span className="stat-icon coral">▤</span><span className="stat-label">만든 활동지</span><strong>{worksheetCount ?? 0}<small>개</small></strong><span className="stat-card-link">활동지 살펴보기 <span aria-hidden>→</span></span></Link>
      </div>
      <div className="dashboard-section-heading"><div><span className="eyebrow">NEXT STEP</span><h2>어떤 일을 할까요?</h2></div></div>
      <div className="quick-grid"><Link className="quick-card" href="/teacher/classrooms"><span className="quick-number">01</span><h3>학급과 학생 관리</h3><p>학급을 만들고 학생 정보를 정리해요.</p><span className="quick-arrow" aria-hidden>↗</span></Link><Link className="quick-card" href="/teacher/worksheets"><span className="quick-number">02</span><h3>활동지 준비</h3><p>수업에 맞는 활동지를 만들거나 업로드해요.</p><span className="quick-arrow" aria-hidden>↗</span></Link><Link className="quick-card" href="/teacher/review"><span className="quick-number">03</span><h3>답안 확인</h3><p>확인이 필요한 답안만 모아 살펴봐요.</p><span className="quick-arrow" aria-hidden>↗</span></Link><Link className="quick-card" href="/teacher/analytics"><span className="quick-number">04</span><h3>학습 흐름 살펴보기</h3><p>학급과 학생의 변화를 확인해요.</p><span className="quick-arrow" aria-hidden>↗</span></Link></div>
    </section>
  );
}
