import { requireStudentSession } from "@/lib/auth/student";

import { studentSignOut } from "./actions";

export const dynamic = "force-dynamic";

export default async function StudentPage() {
  const student = await requireStudentSession();
  const classroom = Array.isArray(student.classrooms) ? student.classrooms[0] : student.classrooms;

  return (
    <main className="page student-page">
      <h1>안녕하세요, {student.display_name} 학생</h1>
      <div className="card">
        <p>{classroom?.name ?? "학급"} · 번호 {student.student_number}</p>
        <p className="muted">아직 제출할 활동지가 없습니다. 활동지의 QR 코드를 스캔해 주세요.</p>
      </div>
      <form action={studentSignOut}>
        <button type="submit" className="secondary">로그아웃</button>
      </form>
    </main>
  );
}
