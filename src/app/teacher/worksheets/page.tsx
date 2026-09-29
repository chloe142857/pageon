import Link from "next/link";

import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WorksheetsPage() {
  const teacher = await requireTeacher();
  const admin = createSupabaseAdminClient();
  const { data: worksheets, error } = await admin
    .from("worksheets")
    .select("id, title, grade_band, semester, status, version_number, updated_at")
    .eq("teacher_id", teacher.id)
    .order("updated_at", { ascending: false });

  return (
    <section>
      <div className="section-heading">
        <div><h1>활동지</h1><p className="muted">문항 구조와 성취기준을 함께 저장합니다.</p></div>
        <span className="inline-links"><Link href="/teacher/worksheets/import">기존 활동지 업로드하기</Link><Link className="button-link" href="/teacher/worksheets/new">새 활동지 만들기</Link></span>
      </div>
      <div className="card">
        {error ? <p className="danger">활동지를 불러오지 못했습니다.</p> : null}
        {worksheets?.length ? <ul className="list">{worksheets.map((worksheet) => <li className="list-item" key={worksheet.id}><span><strong>{worksheet.title}</strong><br /><span className="muted">{worksheet.grade_band} · {worksheet.semester} · {worksheet.status === "published" ? `발행 v${worksheet.version_number}` : "초안"}</span></span><Link href={`/teacher/worksheets/${worksheet.id}`}>열기</Link></li>)}</ul> : <p className="muted">아직 활동지가 없습니다.</p>}
      </div>
    </section>
  );
}
