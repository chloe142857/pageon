import Link from "next/link";

import { resendTeacherConfirmation, teacherAuthenticate } from "./actions";

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
      <form action={resendTeacherConfirmation} className="card form-grid">
        <h2>인증 이메일이 오지 않았나요?</h2>
        <p className="muted">가입할 때 사용한 이메일로 새 인증 링크를 보냅니다.</p>
        <label>가입 이메일<input name="email" type="email" autoComplete="email" required /></label>
        <button type="submit" className="secondary">인증 이메일 다시 보내기</button>
      </form>
      <p><Link href="/student/sign-in">학생 로그인으로 이동</Link></p>
    </main>
  );
}
