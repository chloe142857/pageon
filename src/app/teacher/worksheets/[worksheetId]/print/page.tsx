/* eslint-disable @next/next/no-img-element -- server-generated QR data URL */
import QRCode from "qrcode";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/print-button";
import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ worksheetId: string }> };

export const dynamic = "force-dynamic";

export default async function WorksheetPrintPage({ params }: PageProps) {
  const teacher = await requireTeacher();
  const { worksheetId } = await params;
  const admin = createSupabaseAdminClient();
  const { data: worksheet } = await admin
    .from("worksheets")
    .select("id, title, grade_band, semester, area, unit_name, lesson_objective, version_number, worksheet_token, status")
    .eq("id", worksheetId)
    .eq("teacher_id", teacher.id)
    .maybeSingle();
  if (!worksheet) notFound();

  const { data: questions } = await admin
    .from("worksheet_questions")
    .select("id, question_number, type, question_text, score, page")
    .eq("worksheet_id", worksheetId)
    .order("page")
    .order("question_number");
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const submitUrl = `${protocol}://${host}/submit/${worksheet.worksheet_token}`;
  const qrCode = await QRCode.toDataURL(submitUrl, { width: 220, margin: 1, errorCorrectionLevel: "M" });
  const pages = new Map<number, typeof questions>();
  questions?.forEach((question) => pages.set(question.page, [...(pages.get(question.page) ?? []), question]));

  return (
    <main className="print-page">
      <div className="print-toolbar"><PrintButton /><p>브라우저 인쇄 창에서 ‘PDF로 저장’을 선택해 출력 가능한 PDF를 만드세요.</p></div>
      {[...pages.entries()].map(([pageNumber, pageQuestions]) => (
        <section className="worksheet-sheet" key={pageNumber}>
          <header className="worksheet-header"><div><h1>{worksheet.title}</h1><p>{worksheet.grade_band} · {worksheet.semester} {worksheet.area ? `· ${worksheet.area}` : ""} {worksheet.unit_name ? `· ${worksheet.unit_name}` : ""}</p><p>차시 목표: {worksheet.lesson_objective}</p></div><div className="qr-block"><img src={qrCode} alt="학생 제출 QR" /><small>학생 제출 QR</small></div></header>
          <p className="worksheet-meta">이름: ____________________ &nbsp;&nbsp; 번호: ________ &nbsp;&nbsp; {pageNumber}쪽 / {pages.size}쪽</p>
          {pageQuestions?.map((question) => <article className="print-question" key={question.id}><div className="question-title"><strong>{question.question_number}. {question.question_text}</strong><span>{Number(question.score)}점</span></div><div className="answer-space" /></article>)}
          <footer>활동지 버전 {worksheet.version_number} · QR에는 학생 개인정보가 포함되지 않습니다.</footer>
        </section>
      ))}
    </main>
  );
}
