import Link from "next/link";

import { teacherSignOut } from "./sign-in/actions";

export const dynamic = "force-dynamic";

export default function TeacherLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="page">
      <nav className="nav" aria-label="교사 메뉴">
        <Link href="/teacher">Page On 교사</Link>
        <div className="nav-links">
          <Link href="/teacher">홈</Link>
          <Link href="/teacher/classrooms">학급과 학생</Link>
          <Link href="/teacher/worksheets">활동지</Link>
          <Link href="/teacher/review">교사 검토</Link>
          <Link href="/teacher/analytics">분석</Link>
          <form action={teacherSignOut}>
            <button type="submit" className="secondary">로그아웃</button>
          </form>
        </div>
      </nav>
      {children}
    </main>
  );
}
