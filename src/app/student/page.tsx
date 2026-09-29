import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import { requireStudentSession } from "@/lib/auth/student";

import { studentSignOut } from "./actions";

export const dynamic = "force-dynamic";

export default async function StudentPage() {
  const student = await requireStudentSession();
  const classroom = Array.isArray(student.classrooms) ? student.classrooms[0] : student.classrooms;

  return (
    <main className="page student-page">
      <Link className="student-brand" href="/" aria-label="Page On 첫 화면"><BrandLogo /></Link>
      <span className="eyebrow">MY LEARNING</span>
      <h1>{student.display_name} 학생, 안녕하세요!</h1>
      <div className="student-welcome"><p><strong>{classroom?.name ?? "우리 학급"}</strong> · {student.student_number}번</p><p className="muted">활동지의 QR 코드를 스캔하면 이곳에서 사진을 제출할 수 있어요.</p></div>
      <div className="card"><h2>활동지 제출하기</h2><p className="muted">선생님이 나눠주신 활동지의 QR 코드를 카메라로 스캔해 주세요.</p></div>
      <form action={studentSignOut}>
        <button type="submit" className="secondary">다른 학생으로 로그인</button>
      </form>
    </main>
  );
}
