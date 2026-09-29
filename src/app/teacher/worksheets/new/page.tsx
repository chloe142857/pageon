import Link from "next/link";

import { WorksheetEditor } from "@/components/worksheet-editor";
import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

import { createWorksheet } from "../actions";

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
      <p><Link href="/teacher/worksheets">← 활동지 목록</Link></p>
      <h1>새 활동지 만들기</h1>
      {standards?.length ? <WorksheetEditor action={createWorksheet} standards={standards} /> : <div className="card"><p className="danger">성취기준 데이터가 없습니다. `npm run seed:curriculum`을 먼저 실행하세요.</p></div>}
    </section>
  );
}
