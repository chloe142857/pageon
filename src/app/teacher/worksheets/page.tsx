import Link from "next/link";

import { PendingSubmitButton } from "@/components/pending-submit-button";
import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

import { deleteWorksheet } from "./actions";

export const dynamic = "force-dynamic";

export default async function WorksheetsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const teacher = await requireTeacher();
  const { error: message, notice } = await searchParams;
  const admin = createSupabaseAdminClient();
  const { data: worksheets, error } = await admin
    .from("worksheets")
    .select("id, title, grade_band, semester, area, unit_name, status, version_number, updated_at")
    .eq("teacher_id", teacher.id)
    .order("updated_at", { ascending: false });
  const folders = new Map<string, NonNullable<typeof worksheets>>();
  worksheets?.forEach((worksheet) => {
    const label = [worksheet.grade_band, worksheet.semester, worksheet.unit_name || "단원 미분류"].filter(Boolean).join(" · ");
    folders.set(label, [...(folders.get(label) ?? []), worksheet]);
  });

  return (
    <section>
      <div className="section-heading">
        <div><span className="eyebrow">WORKSHEETS</span><h1>활동지</h1><p className="muted">단원별로 활동지를 모아 보고, 수업에 맞는 자료를 빠르게 준비하세요.</p></div>
        <span className="inline-links"><Link className="button-link secondary-link" href="/teacher/worksheets/import">기존 활동지 올리기</Link><Link className="button-link" href="/teacher/worksheets/new">+ 새 활동지 만들기</Link></span>
      </div>
      {message ? <p className="danger" role="alert">{message}</p> : null}
      {notice ? <p className="notice" role="status">{notice}</p> : null}
      <div className="worksheet-folders">
        {error ? <p className="danger">활동지를 불러오지 못했습니다.</p> : null}
        {folders.size ? [...folders.entries()].map(([label, items], index) => <details className="worksheet-folder" key={label} open={index === 0}>
          <summary><span><b>▣</b><strong>{label}</strong><small>{items.length}개 활동지</small></span><span>열기</span></summary>
          <ul className="folder-list">{items.map((worksheet) => <li key={worksheet.id}>
            <div><strong>{worksheet.title}</strong><p>{worksheet.area || "영역 미입력"} · 최근 수정 {new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(new Date(worksheet.updated_at))}</p></div>
            <div className="inline-links"><span className={worksheet.status === "published" ? "status-badge success" : "status-badge draft"}>{worksheet.status === "published" ? "발행됨" : "작성 중"}</span><Link href={`/teacher/worksheets/${worksheet.id}`}>열기</Link><form action={deleteWorksheet}><input type="hidden" name="worksheetId" value={worksheet.id} /><PendingSubmitButton className="text-button danger-text" pendingLabel="삭제 중…" confirmMessage="제출 기록이 없는 이 활동지를 영구 삭제합니다. 계속할까요?">삭제</PendingSubmitButton></form></div>
          </li>)}</ul>
        </details>) : <div className="card empty-state"><span aria-hidden>▤</span><h3>아직 만든 활동지가 없어요.</h3><p>첫 활동지를 만들고 수업을 시작해 보세요.</p><Link className="button-link" href="/teacher/worksheets/new">활동지 만들기</Link></div>}
      </div>
    </section>
  );
}
