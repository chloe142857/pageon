import Link from "next/link";

import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TeacherDashboardPage() {
  const teacher = await requireTeacher();
  const admin = createSupabaseAdminClient();
  const { count: classroomCount } = await admin
    .from("classrooms")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", teacher.id)
    .is("archived_at", null);
  const { count: worksheetCount } = await admin
    .from("worksheets")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", teacher.id);

  return (
    <section>
      <h1>교사 홈</h1>
      <div className="card">
        <p>현재 운영 중인 학급: <strong>{classroomCount ?? 0}개</strong></p>
        <p>만든 활동지: <strong>{worksheetCount ?? 0}개</strong></p>
        <p><Link href="/teacher/review">교사 검토 열기</Link></p>
        <p><Link href="/teacher/classrooms">학급과 학생 관리하기</Link></p>
        <Link href="/teacher/worksheets">활동지 관리하기</Link>
        <p><Link href="/teacher/analytics">분석 대시보드 열기</Link></p>
      </div>
    </section>
  );
}
