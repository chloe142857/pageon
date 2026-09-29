import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";

import { studentSignIn } from "../actions";

type SearchParams = Promise<{ error?: string; next?: string }>;

export default async function StudentSignInPage({ searchParams }: { searchParams: SearchParams }) {
  const { error, next } = await searchParams;

  return (
    <main className="page student-page">
      <Link className="student-brand" href="/" aria-label="Page On 첫 화면"><BrandLogo /></Link>
      <div className="student-intro"><span className="eyebrow">FOR STUDENTS</span><h1>안녕, 만나서 반가워!</h1><p>선생님에게 받은 정보를 입력하고 시작해요.</p></div>
      <form action={studentSignIn} className="card form-grid auth-card">
        <input type="hidden" name="next" value={next ?? ""} />
        {error ? <p className="danger" role="alert">{error}</p> : null}
        <label>
          학급 코드
          <input name="classroomCode" autoCapitalize="characters" autoComplete="off" required />
        </label>
        <label>
          번호
          <input name="studentNumber" type="number" min={1} max={9999} inputMode="numeric" autoComplete="username" required />
        </label>
        <label>
          이름
          <input name="displayName" autoComplete="name" required />
        </label>
        <label>
          비밀번호 (숫자 4~8자리)
          <input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,8}" minLength={4} maxLength={8} autoComplete="current-password" required />
        </label>
        <button type="submit">로그인</button>
      </form>
      <p className="auth-switch">선생님인가요? <Link href="/teacher/sign-in">선생님 로그인으로 이동</Link></p>
    </main>
  );
}
