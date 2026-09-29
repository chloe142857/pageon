import Link from "next/link";
import { notFound } from "next/navigation";

import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { PendingSubmitButton } from "@/components/pending-submit-button";

import { createStudent, deleteClassroom, importStudents, updateClassroom, updateStudent } from "../../actions";

type PageProps = {
  params: Promise<{ classroomId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export const dynamic = "force-dynamic";

export default async function ClassroomDetailPage({ params, searchParams }: PageProps) {
  const teacher = await requireTeacher();
  const { classroomId } = await params;
  const { error, notice } = await searchParams;
  const admin = createSupabaseAdminClient();
  const { data: classroom } = await admin
    .from("classrooms")
    .select("id, name, school_year, join_code")
    .eq("id", classroomId)
    .eq("teacher_id", teacher.id)
    .maybeSingle();

  if (!classroom) {
    notFound();
  }

  const { data: students, error: studentsError } = await admin
    .from("students")
    .select("id, display_name, student_number, student_identifier, active")
    .eq("classroom_id", classroomId)
    .order("student_number");

  return (
    <section>
      <p className="back-link"><Link href="/teacher/classrooms">← 학급 목록</Link></p>
      <div className="section-heading page-title"><div><span className="eyebrow">CLASSROOM DETAILS</span><h1>{classroom.name}</h1><p className="muted">학생 {students?.length ?? 0}명 · 학급 코드 <strong>{classroom.join_code}</strong></p></div><form action={deleteClassroom}><input type="hidden" name="classroomId" value={classroom.id} /><PendingSubmitButton className="danger-button" pendingLabel="학급을 삭제하고 있어요…" confirmMessage="이 학급과 제출 기록이 없는 학생 정보가 삭제됩니다. 계속할까요?">학급 삭제</PendingSubmitButton></form></div>
      {error ? <p className="danger" role="alert">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <div className="classroom-detail-grid"><form action={updateClassroom} className="card form-grid">
        <h2>학급 정보</h2>
        <input type="hidden" name="classroomId" value={classroom.id} />
        <label>
          학급 이름
          <input name="name" defaultValue={classroom.name} maxLength={60} required />
        </label>
        <label>
          학년도
          <input name="schoolYear" defaultValue={classroom.school_year} maxLength={20} />
        </label>
        <label>
          학급 코드
          <input name="joinCode" defaultValue={classroom.join_code} autoCapitalize="characters" maxLength={12} required />
        </label>
        <p className="notice">학생은 학급 코드, 번호, 이름, 비밀번호로 로그인합니다.</p>
        <PendingSubmitButton pendingLabel="학급 정보를 저장하고 있어요…">학급 정보 저장</PendingSubmitButton>
      </form>

      <form action={createStudent} className="card form-grid">
        <h2>학생 추가하기</h2>
        <input type="hidden" name="classroomId" value={classroom.id} />
        <div className="two-column">
          <label>
            학생 이름
            <input name="displayName" maxLength={60} required />
          </label>
          <label>
            학생 번호
            <input name="studentNumber" type="number" min={1} max={9999} required />
          </label>
        </div>
        <label>
            숫자 비밀번호 (4~8자리)
            <input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,8}" minLength={4} maxLength={8} required />
        </label>
        <PendingSubmitButton pendingLabel="학생을 등록하고 있어요…">학생 등록</PendingSubmitButton>
      </form>
      </div>

      <section className="card form-grid">
        <div><h2>학생 명단 한 번에 등록하기</h2><p className="muted">양식을 내려받아 학생번호, 학생이름, 비밀번호를 입력한 뒤 CSV 파일로 올려 주세요.</p></div>
        <a className="button-link secondary-link template-link" href="/api/classrooms/template">명단 양식 내려받기</a>
        <form action={importStudents} className="form-grid" encType="multipart/form-data"><input type="hidden" name="classroomId" value={classroom.id} /><label>작성한 명단 파일<input name="studentList" type="file" accept=".csv,text/csv" required /></label><PendingSubmitButton pendingLabel="학생 명단을 등록하고 있어요…">학생 명단 등록</PendingSubmitButton></form>
      </section>

      <div className="card">
        <h2>등록 학생</h2>
        {studentsError ? <p className="danger">학생 목록을 불러오지 못했습니다.</p> : null}
        {students?.length ? (
          <div className="form-grid">
            {students.map((student) => (
              <form action={updateStudent} className="card form-grid" key={student.id}>
                <input type="hidden" name="classroomId" value={classroom.id} />
                <input type="hidden" name="studentId" value={student.id} />
                <div className="two-column">
                  <label>
                    학생 이름
                    <input name="displayName" defaultValue={student.display_name} maxLength={60} required />
                  </label>
                  <label>
                    학생 번호
                    <input name="studentNumber" type="number" defaultValue={student.student_number} min={1} max={9999} required />
                  </label>
                </div>
                <label>
                    새 숫자 비밀번호 (변경할 때만 입력)
                    <input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,8}" minLength={4} maxLength={8} />
                </label>
                <label>
                  <span><input name="active" type="checkbox" defaultChecked={student.active} /> 학생 로그인 허용</span>
                </label>
                <PendingSubmitButton pendingLabel="학생 정보를 저장하고 있어요…">학생 정보 저장</PendingSubmitButton>
              </form>
            ))}
          </div>
        ) : <p className="muted">아직 등록한 학생이 없습니다.</p>}
      </div>
    </section>
  );
}
