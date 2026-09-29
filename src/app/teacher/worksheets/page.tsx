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
        <div><span className="eyebrow">WORKSHEETS</span><h1>활동지</h1><p className="muted">수업에 맞는 활동지를 만들고, 학생의 제출물을 한곳에서 확인하세요.</p></div>
        <span className="inline-links"><Link className="button-link secondary-link" href="/teacher/worksheets/import">기존 활동지 올리기</Link><Link className="button-link" href="/teacher/worksheets/new">+ 새 활동지 만들기</Link></span>
      </div>
      <div className="card">
        {error ? <p className="danger">활동지를 불러오지 못했습니다.</p> : null}
        {worksheets?.length ? <ul className="list">{worksheets.map((worksheet) => <li className="list-item" key={worksheet.id}><span><strong>{worksheet.title}</strong><br /><span className="muted">{worksheet.grade_band} · {worksheet.semester}</span></span><span className="inline-links"><span className={worksheet.status === "published" ? "status-badge success" : "status-badge draft"}>{worksheet.status === "published" ? "발행됨" : "작성 중"}</span><Link href={`/teacher/worksheets/${worksheet.id}`}>살펴보기 →</Link></span></li>)}</ul> : <div className="empty-state"><span aria-hidden>▤</span><h3>아직 만든 활동지가 없어요.</h3><p>첫 활동지를 만들고 수업을 시작해 보세요.</p><Link className="button-link" href="/teacher/worksheets/new">활동지 만들기</Link></div>}
      </div>
    </section>
  );
}
