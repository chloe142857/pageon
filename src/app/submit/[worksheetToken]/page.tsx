import { notFound } from "next/navigation";

import { StudentCapture } from "@/components/student-capture";
import { getStudentSession } from "@/lib/auth/student";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ worksheetToken: string }> };

export const dynamic = "force-dynamic";

export default async function WorksheetSubmitEntryPage({ params }: PageProps) {
  const { worksheetToken } = await params;
  const admin = createSupabaseAdminClient();
  const { data: worksheet } = await admin
    .from("worksheets")
    .select("title, grade_band, semester, lesson_objective, total_pages")
    .eq("worksheet_token", worksheetToken)
    .eq("status", "published")
    .maybeSingle();
  if (!worksheet) notFound();

  const student = await getStudentSession();
  if (!student) {
    const next = `/submit/${worksheetToken}`;
    return (
      <main className="page student-page">
        <h1>{worksheet.title}</h1>
        <div className="card"><p>{worksheet.grade_band} · {worksheet.semester}</p><p>{worksheet.lesson_objective}</p><a className="button-link" href={`/student/sign-in?next=${encodeURIComponent(next)}`}>학생 로그인 후 촬영하기</a></div>
      </main>
    );
  }

  return (
    <main className="page student-page">
      <h1>{worksheet.title}</h1>
      <div className="card"><p>{student.display_name}님 · {worksheet.grade_band} · {worksheet.semester}</p><p>{worksheet.lesson_objective}</p></div>
      <StudentCapture worksheetToken={worksheetToken} totalPages={worksheet.total_pages} />
    </main>
  );
}
