import Link from "next/link";
import { notFound } from "next/navigation";

import { WorksheetEditor } from "@/components/worksheet-editor";
import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { QuestionType } from "@/lib/worksheet";

import { createWorksheetFromImport } from "../../actions";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ importId: string }>; searchParams: Promise<{ error?: string; notice?: string }> };
type Analysis = {
  title?: string;
  gradeBand?: string;
  semester?: string;
  area?: string;
  unitName?: string;
  lessonObjective?: string;
  standardIds?: string[];
  questions?: Array<{ type?: QuestionType; questionText?: string; page?: number; achievementStandardId?: string }>;
};

function isQuestionType(value: unknown): value is QuestionType {
  return value === "multiple_choice" || value === "short_answer" || value === "calculation" || value === "constructed_response";
}

export default async function ImportWorksheetDetailPage({ params, searchParams }: PageProps) {
  const teacher = await requireTeacher();
  const { importId } = await params;
  const { error, notice } = await searchParams;
  const admin = createSupabaseAdminClient();
  const [{ data: pdfImport }, { data: standards }] = await Promise.all([
    admin.from("worksheet_imports").select("id, original_filename, original_storage_path, page_count, extracted_text, analysis, analysis_mode, status, worksheet_id, created_at").eq("id", importId).eq("teacher_id", teacher.id).maybeSingle(),
    admin.from("achievement_standards").select("id, code, description, grade_band, area").order("code"),
  ]);
  if (!pdfImport) notFound();

  const { data: signed } = await admin.storage.from("worksheet-sources").createSignedUrl(pdfImport.original_storage_path, 60 * 10);
  if (pdfImport.status === "registered" && pdfImport.worksheet_id) {
    return (
      <section>
        <p><Link href="/teacher/worksheets">← 활동지 목록</Link></p>
        <h1>{pdfImport.original_filename}</h1>
        <div className="card"><p className="notice">이 PDF는 이미 활동지 초안으로 등록되었습니다.</p><p className="inline-links"><Link className="button-link" href={`/teacher/worksheets/${pdfImport.worksheet_id}`}>등록된 활동지 열기</Link>{signed?.signedUrl ? <a href={signed.signedUrl}>원본 PDF 열기</a> : null}</p></div>
      </section>
    );
  }
  if (!standards?.length) {
    return <section><p><Link href="/teacher/worksheets/import">← PDF 업로드</Link></p><p className="danger">성취기준 데이터가 없어 등록할 수 없습니다.</p></section>;
  }

  const analysis = (pdfImport.analysis && typeof pdfImport.analysis === "object" ? pdfImport.analysis : {}) as Analysis;
  const standardIds = (analysis.standardIds ?? []).filter((id) => standards.some((standard) => standard.id === id));
  const defaultStandardId = standardIds[0] ?? standards[0].id;
  const initial = {
    title: analysis.title || pdfImport.original_filename.replace(/\.pdf$/i, ""),
    gradeBand: analysis.gradeBand || "3~4학년",
    semester: analysis.semester || "1학기",
    area: analysis.area || "",
    unitName: analysis.unitName || "",
    lessonObjective: analysis.lessonObjective || "원본 PDF의 차시 목표를 확인하여 입력하세요.",
    totalPages: pdfImport.page_count,
    worksheetStandardIds: standardIds.length ? standardIds : [defaultStandardId],
    questions: (analysis.questions ?? []).map((question) => ({
      type: isQuestionType(question.type) ? question.type : "short_answer" as QuestionType,
      questionText: question.questionText || "원본 PDF 문항을 확인하여 입력하세요.",
      answer: "",
      explanation: "",
      score: 1,
      achievementStandardId: standards.some((standard) => standard.id === question.achievementStandardId) ? question.achievementStandardId! : defaultStandardId,
      page: Math.min(Math.max(question.page ?? 1, 1), pdfImport.page_count),
      answerBBox: null,
    })),
    generationSource: "pdf_import" as const,
  };

  return (
    <section>
      <p className="back-link"><Link href="/teacher/worksheets/import">← 파일 선택으로 돌아가기</Link></p>
      <div className="section-heading page-title"><div><span className="eyebrow">CHECK BEFORE SAVING</span><h1>활동지 내용 확인</h1><p className="muted">{pdfImport.original_filename} · {pdfImport.page_count}페이지</p></div>{signed?.signedUrl ? <a className="button-link secondary-link" href={signed.signedUrl}>원본 PDF 열기</a> : null}</div>
      {error ? <p className="danger" role="alert">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}
      <div className="card"><p className="mock-notice">아래 내용은 원본에서 읽은 정보를 바탕으로 제안한 것입니다. 문항과 정답을 확인하고 필요한 부분을 고쳐 주세요.</p><details><summary>읽어 온 내용 살펴보기</summary><pre className="pdf-text-preview">{pdfImport.extracted_text.slice(0, 4000) || "글자를 읽지 못했습니다. 원본을 보고 문항을 입력해 주세요."}</pre></details></div>
      <WorksheetEditor action={createWorksheetFromImport} importId={pdfImport.id} standards={standards} initial={initial} />
    </section>
  );
}
