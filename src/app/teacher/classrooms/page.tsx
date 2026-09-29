import Link from "next/link";

import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { PendingSubmitButton } from "@/components/pending-submit-button";

import { createClassroom } from "../actions";

type SearchParams = Promise<{ error?: string; notice?: string }>;

export const dynamic = "force-dynamic";

export default async function ClassroomsPage({ searchParams }: { searchParams: SearchParams }) {
  const teacher = await requireTeacher();
  const { error, notice } = await searchParams;
  const admin = createSupabaseAdminClient();
  const { data: classrooms, error: classroomsError } = await admin
    .from("classrooms")
    .select("id, name, school_year, join_code, created_at")
    .eq("teacher_id", teacher.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  return (
    <section>
      <div className="section-heading page-title"><div><span className="eyebrow">CLASSROOM</span><h1>학급과 학생</h1><p className="muted">수업을 함께할 학급을 만들고 학생을 초대하세요.</p></div></div>
      <div className="classroom-grid">
      <form action={createClassroom} className="card form-grid">
        <h2>새 학급 만들기</h2><p className="muted">학생이 기억하기 쉬운 학급 코드도 직접 정할 수 있어요.</p>
        {error ? <p className="danger" role="alert">{error}</p> : null}
        {notice ? <p className="notice">{notice}</p> : null}
        <label>
          학급 이름
          <input name="name" placeholder="예: 3학년 1반" maxLength={60} required />
        </label>
        <label>
          학년도 (선택)
          <input name="schoolYear" placeholder="예: 2026" maxLength={20} />
        </label>
        <label>
          학급 코드
          <input name="joinCode" placeholder="예: WKG301" autoCapitalize="characters" maxLength={12} required />
          <span className="muted">영문 대문자와 숫자 4~12자</span>
        </label>
        <PendingSubmitButton pendingLabel="학급을 만들고 있어요…">학급 만들기 <span aria-hidden>→</span></PendingSubmitButton>
      </form>

      <div className="card">
        <h2>내 학급</h2>
        {classroomsError ? <p className="danger">학급을 불러오지 못했습니다.</p> : null}
        {classrooms?.length ? (
          <ul className="list">
            {classrooms.map((classroom) => (
              <li key={classroom.id} className="list-item">
                <span>
                  <strong>{classroom.name}</strong>
                  <br />
                  <span className="muted">{classroom.school_year || "학년도 미입력"} · 학급 코드 {classroom.join_code}</span>
                </span>
                <Link href={`/teacher/classrooms/${classroom.id}`}>관리하기 <span aria-hidden>→</span></Link>
              </li>
            ))}
          </ul>
        ) : <p className="muted">아직 등록한 학급이 없습니다.</p>}
      </div>
      </div>
    </section>
  );
}
