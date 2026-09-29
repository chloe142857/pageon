import Link from "next/link";

import { resendTeacherConfirmation, teacherAuthenticate } from "./actions";

type SearchParams = Promise<{ error?: string; notice?: string }>;

export default async function TeacherSignInPage({ searchParams }: { searchParams: SearchParams }) {
  const { error, notice } = await searchParams;

  return (
    <section className="page student-page">
      <div className="student-intro"><span className="eyebrow">FOR TEACHERS</span><h1>다시 만나 반가워요.</h1><p>오늘의 수업을 이어서 준비해 볼까요?</p></div>
      <form action={teacherAuthenticate} className="card form-grid auth-card">
        <h2>선생님 로그인</h2>
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
          <button type="submit" name="intent" value="sign-up" className="secondary">처음이신가요? 가입하기</button>
        </div>
      </form>
      <form action={resendTeacherConfirmation} className="card form-grid auth-secondary">
        <h2>인증 이메일이 오지 않았나요?</h2>
        <p className="muted">가입할 때 사용한 이메일로 새 인증 링크를 보냅니다.</p>
        <label>가입 이메일<input name="email" type="email" autoComplete="email" required /></label>
        <button type="submit" className="secondary">인증 이메일 다시 보내기</button>
      </form>
      <p className="auth-switch">학생인가요? <Link href="/student/sign-in">학생 로그인으로 이동</Link></p>
    </section>
  );
}
