import Link from "next/link";

import { teacherAuthenticate } from "./actions";

type SearchParams = Promise<{ error?: string; notice?: string }>;

export default async function TeacherSignInPage({ searchParams }: { searchParams: SearchParams }) {
  const { error, notice } = await searchParams;

  return (
    <main className="page student-page">
      <h1>교사 로그인</h1>
      <p className="muted">교사 계정으로 학급과 학생을 관리합니다.</p>
      <form action={teacherAuthenticate} className="card form-grid">
        {error ? <p className="danger" role="alert">{error}</p> : null}
        {notice ? <p className="notice">{notice}</p> : null}
        <label>
          이메일
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          비밀번호
          <input name="password" type="password" autoComplete="current-password" minLength={8} required />
        </label>
        <div className="two-column">
          <button type="submit" name="intent" value="sign-in">로그인</button>
          <button type="submit" name="intent" value="sign-up" className="secondary">교사 계정 만들기</button>
        </div>
      </form>
      <p><Link href="/student/sign-in">학생 로그인으로 이동</Link></p>
    </main>
  );
}
