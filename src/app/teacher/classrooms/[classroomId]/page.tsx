import Link from "next/link";
import { notFound } from "next/navigation";

import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

import { createStudent, updateClassroom, updateStudent } from "../../actions";

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
      <p><Link href="/teacher/classrooms">← 학급 목록</Link></p>
      <h1>{classroom.name}</h1>
      {error ? <p className="danger" role="alert">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <form action={updateClassroom} className="card form-grid">
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
        <p className="muted">학생 로그인 학급 코드: <strong>{classroom.join_code}</strong></p>
        <button type="submit">학급 정보 저장</button>
      </form>

      <form action={createStudent} className="card form-grid">
        <h2>학생 등록</h2>
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
        <div className="two-column">
          <label>
            학생 식별자
            <input name="studentIdentifier" placeholder="예: KIM01" maxLength={32} required />
          </label>
          <label>
            PIN (숫자 4~8자리)
            <input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,8}" minLength={4} maxLength={8} required />
          </label>
        </div>
        <button type="submit">학생 등록</button>
      </form>

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
                <div className="two-column">
                  <label>
                    학생 식별자
                    <input name="studentIdentifier" defaultValue={student.student_identifier} maxLength={32} required />
                  </label>
                  <label>
                    새 PIN (변경할 때만 입력)
                    <input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,8}" minLength={4} maxLength={8} />
                  </label>
                </div>
                <label>
                  <span><input name="active" type="checkbox" defaultChecked={student.active} /> 학생 로그인 허용</span>
                </label>
                <button type="submit">학생 정보 저장</button>
              </form>
            ))}
          </div>
        ) : <p className="muted">아직 등록한 학생이 없습니다.</p>}
      </div>
    </section>
  );
}
