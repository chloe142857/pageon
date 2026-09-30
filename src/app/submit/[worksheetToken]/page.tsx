import { notFound } from "next/navigation";
import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
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
    .select("title, grade_band, semester, lesson_objective, total_pages, structured_content")
    .eq("worksheet_token", worksheetToken)
    .eq("status", "published")
    .maybeSingle();
  if (!worksheet) notFound();
  const content = worksheet.structured_content && typeof worksheet.structured_content === "object" ? worksheet.structured_content as Record<string, unknown> : {};
  const worksheetContent = content.worksheet && typeof content.worksheet === "object" ? content.worksheet as Record<string, unknown> : {};
  const gradeLabel = typeof worksheetContent.curriculum_grade === "number" ? `${worksheetContent.curriculum_grade}학년` : worksheet.grade_band;

  const student = await getStudentSession();
  if (!student) {
    const next = `/submit/${worksheetToken}`;
    return (
      <main className="page student-page">
        <Link className="student-brand" href="/" aria-label="Page On 첫 화면"><BrandLogo /></Link>
        <span className="eyebrow">ACTIVITY SHEET</span>
        <h1>{worksheet.title}</h1>
        <div className="card"><p className="muted">{gradeLabel} · {worksheet.semester}</p><p>{worksheet.lesson_objective}</p><a className="button-link" href={`/student/sign-in?next=${encodeURIComponent(next)}`}>로그인하고 사진 제출하기 <span aria-hidden>→</span></a></div>
      </main>
    );
  }

  return (
    <main className="page student-page">
      <Link className="student-brand" href="/" aria-label="Page On 첫 화면"><BrandLogo /></Link>
      <span className="eyebrow">ACTIVITY SHEET</span>
      <h1>{worksheet.title}</h1>
      <div className="student-welcome"><p><strong>{student.display_name} 학생</strong> · {gradeLabel} · {worksheet.semester}</p><p>{worksheet.lesson_objective}</p></div>
      <StudentCapture worksheetToken={worksheetToken} totalPages={worksheet.total_pages} />
    </main>
  );
}
