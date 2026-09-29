import Link from "next/link";

import { WorksheetGenerator } from "@/components/worksheet-generator";
import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

import { generateWorksheet } from "../actions";

export const maxDuration = 60;

export const dynamic = "force-dynamic";

export default async function NewWorksheetPage() {
  await requireTeacher();
  const admin = createSupabaseAdminClient();
  const { data: standards } = await admin
    .from("achievement_standards")
    .select("id, code, description, grade_band, area")
    .order("code");

  return (
    <section>
      <p className="back-link"><Link href="/teacher/worksheets">← 활동지 목록</Link></p>
      <div className="section-heading page-title"><div><span className="eyebrow">CREATE WORKSHEET</span><h1>새 활동지 만들기</h1><p className="muted">수업 내용과 문항 구성을 고르면 활동지 초안을 준비합니다.</p></div></div>
      {standards?.length ? <WorksheetGenerator action={generateWorksheet} standards={standards} /> : <div className="card"><p className="danger">활동지를 준비하는 데 필요한 교육과정 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p></div>}
    </section>
  );
}
