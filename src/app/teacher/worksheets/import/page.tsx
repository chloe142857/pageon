import Link from "next/link";

import { requireTeacher } from "@/lib/auth/teacher";

import { uploadPdfImport } from "../actions";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ error?: string }> };

export default async function ImportWorksheetPage({ searchParams }: PageProps) {
  await requireTeacher();
  const { error } = await searchParams;

  return (
    <section>
      <p><Link href="/teacher/worksheets">← 활동지 목록</Link></p>
      <h1>기존 활동지 업로드하기</h1>
      <p className="muted">기존 수학 활동지 PDF를 올리면 페이지 수와 텍스트를 읽어 교사용 편집 초안을 만듭니다.</p>
      {error ? <p className="danger" role="alert">{error}</p> : null}
      <form action={uploadPdfImport} className="card form-grid">
        <p className="mock-notice">현재 추천은 AI 확정 결과가 아닌 개발용 텍스트 분석입니다. 학년·성취기준·문항 유형·정답은 다음 화면에서 교사가 반드시 확인하고 수정합니다.</p>
        <label>수학 활동지 PDF<input name="pdf" type="file" accept="application/pdf,.pdf" required /></label>
        <p className="muted">PDF만 가능 · 최대 10MB · 학생 개인정보는 업로드하지 마세요. 원본은 교사만 접근 가능한 비공개 저장소에 보관됩니다.</p>
        <button type="submit">PDF 분석 후 편집하기</button>
      </form>
    </section>
  );
}
