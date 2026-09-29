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
      <p className="back-link"><Link href="/teacher/worksheets">← 활동지 목록</Link></p>
      <div className="section-heading page-title"><div><span className="eyebrow">BRING YOUR WORKSHEET</span><h1>기존 활동지 올리기</h1><p className="muted">이미 가지고 계신 수학 활동지를 가져와 학생 제출에 활용하세요.</p></div></div>
      {error ? <p className="danger" role="alert">{error}</p> : null}
      <form action={uploadPdfImport} className="card form-grid">
        <p className="mock-notice">PDF에서 읽을 수 있는 글자를 바탕으로 초안을 제안합니다. 학년, 문항, 정답과 성취기준은 원본과 비교해 꼭 확인해 주세요.</p>
        <label>수학 활동지 PDF<input name="pdf" type="file" accept="application/pdf,.pdf" required /></label>
        <p className="muted">PDF 파일만 가능 · 최대 10MB · 학생 개인정보가 들어간 자료는 올리지 말아 주세요.</p>
        <button type="submit">활동지 내용 확인하기 →</button>
      </form>
    </section>
  );
}
