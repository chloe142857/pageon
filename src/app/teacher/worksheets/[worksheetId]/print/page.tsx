/* eslint-disable @next/next/no-img-element -- server-generated QR data URL */
import QRCode from "qrcode";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { GeometryDiagram as GeometryDiagramFigure } from "@/components/geometry-diagram";
import { PrintButton } from "@/components/print-button";
import { WorksheetFlow } from "@/components/worksheet-flow";
import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { geometryDiagramKinds, type GeometryDiagram } from "@/lib/worksheet";

type PageProps = { params: Promise<{ worksheetId: string }> };

function calculationLayout(questionText: string) {
  const match = questionText.match(/(-?\d+)\s*([+\-×xX*÷/])\s*(-?\d+)\s*=?/);
  if (!match) return null;
  const expression = match[0];
  const prompt = questionText.replace(expression, "").replace(/[\n\s]+/g, " ").trim().replace(/[.:]+$/, "");
  return { prompt, top: match[1], operator: match[2] === "x" || match[2] === "X" || match[2] === "*" ? "×" : match[2] === "/" ? "÷" : match[2], bottom: match[3] };
}

function isGeometryDiagram(value: unknown): value is GeometryDiagram {
  return Boolean(value && typeof value === "object" && geometryDiagramKinds.includes((value as GeometryDiagram).kind) && Array.isArray((value as GeometryDiagram).labels));
}

function inferredGeometryDiagram(questionText: string): GeometryDiagram | null {
  if (/삼각형/.test(questionText)) return { kind: "triangle", labels: ["ㄱ", "ㄴ", "ㄷ"] };
  if (/사각형|네모/.test(questionText)) return { kind: "quadrilateral", labels: ["ㄱ", "ㄴ", "ㄷ", "ㄹ"] };
  if (/각|직각/.test(questionText)) return { kind: "angle", labels: ["ㄱ", "ㄴ", "ㄷ"] };
  return null;
}

export const dynamic = "force-dynamic";

export default async function WorksheetPrintPage({ params }: PageProps) {
  const teacher = await requireTeacher();
  const { worksheetId } = await params;
  const admin = createSupabaseAdminClient();
  const { data: worksheet } = await admin
    .from("worksheets")
    .select("id, title, grade_band, semester, area, unit_name, lesson_objective, version_number, worksheet_token, status, structured_content")
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
  const qrCode = worksheet.status === "published"
    ? await QRCode.toDataURL(submitUrl, { width: 220, margin: 1, errorCorrectionLevel: "M" })
    : null;
  const pages = new Map<number, typeof questions>();
  questions?.forEach((question) => pages.set(question.page, [...(pages.get(question.page) ?? []), question]));
  const structured = worksheet.structured_content && typeof worksheet.structured_content === "object" ? worksheet.structured_content as Record<string, unknown> : {};
  const structuredWorksheet = structured.worksheet && typeof structured.worksheet === "object" ? structured.worksheet as Record<string, unknown> : {};
  const structuredQuestions = Array.isArray(structured.questions) ? structured.questions as Array<Record<string, unknown>> : [];
  const categoryById = new Map(structuredQuestions.map((question) => [question.question_id, question.category]));
  const diagramById = new Map(structuredQuestions.flatMap((question) => isGeometryDiagram(question.diagram) ? [[question.question_id, question.diagram] as const] : []));
  const gradeLabel = typeof structuredWorksheet.curriculum_grade === "number" ? `${structuredWorksheet.curriculum_grade}학년` : worksheet.grade_band;

  return (
    <main className="print-page">
      <div className="print-toolbar"><PrintButton /><p>{qrCode ? "브라우저 인쇄 창에서 ‘PDF로 저장’을 선택해 출력 가능한 PDF를 만드세요." : "초안 미리보기입니다. 학생 제출 QR은 발행 후 표시됩니다."}</p></div>
      <div className="print-flow"><WorksheetFlow current={4} links={{ 1: "/teacher/worksheets/new", 2: `/teacher/worksheets/${worksheet.id}`, 3: `/teacher/worksheets/${worksheet.id}` }} /></div>
      {[...pages.entries()].map(([pageNumber, pageQuestions]) => (
        <section className="worksheet-sheet" key={pageNumber}>
          <header className="worksheet-header"><div><h1>{worksheet.title}</h1><p>{gradeLabel} · {worksheet.semester} {worksheet.area ? `· ${worksheet.area}` : ""} {worksheet.unit_name ? `· ${worksheet.unit_name}` : ""}</p><p>차시 목표: {worksheet.lesson_objective}</p></div>{qrCode ? <div className="qr-block"><img src={qrCode} alt="학생 제출 QR" /><small>학생 제출 QR</small></div> : <div className="qr-block"><strong>초안</strong><small>발행 후 QR 표시</small></div>}</header>
          <p className="worksheet-meta">이름: ____________________ &nbsp;&nbsp; 번호: ________ &nbsp;&nbsp; {pageNumber}쪽 / {pages.size}쪽</p>
          <div className="worksheet-question-grid">
          {pageQuestions?.map((question) => {
            const category = categoryById.get(question.id);
            const isCalculation = category === "calculation" || question.type === "calculation";
            const calculation = isCalculation ? calculationLayout(question.question_text) : null;
            const diagram = diagramById.get(question.id) ?? inferredGeometryDiagram(question.question_text);
            const layoutClass = isCalculation ? "calculation" : category === "word_problem" ? "word-problem" : question.type === "constructed_response" ? "constructed-response" : "compact-question";
            return <article className={`print-question ${layoutClass}`} key={question.id}>
              <div className="question-title"><strong>{question.question_number}. {calculation?.prompt || question.question_text}</strong></div>
              {calculation ? calculation.operator === "÷"
                ? <div className="long-division" aria-label={`${calculation.top} 나누기 ${calculation.bottom}`}><span>{calculation.bottom}</span><b>{calculation.top}</b></div>
                : <div className="vertical-calculation" aria-label={`${calculation.top} ${calculation.operator} ${calculation.bottom}`}><span>{calculation.top}</span><span>{calculation.operator} {calculation.bottom}</span></div>
                : null}
              {diagram ? <GeometryDiagramFigure diagram={diagram} className="print-geometry-diagram" /> : null}
              <div className={calculation ? "calculation-answer-line" : "answer-space"} />
            </article>;
          })}
          </div>
          <footer>{qrCode ? `활동지 버전 ${worksheet.version_number} · QR에는 학생 개인정보가 포함되지 않습니다.` : "초안 미리보기 · 학생 제출 QR은 발행 후 표시됩니다."}</footer>
        </section>
      ))}
    </main>
  );
}
