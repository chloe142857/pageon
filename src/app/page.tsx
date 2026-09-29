import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page student-page">
      <h1>Page On 수학 활동지</h1>
      <div className="card">
        <p>교사는 학급과 학생을 관리하고, 학생은 학급 코드와 PIN으로 로그인합니다.</p>
        <p><Link href="/teacher/sign-in">교사 로그인</Link></p>
        <p><Link href="/student/sign-in">학생 로그인</Link></p>
      </div>
    </main>
  );
}
