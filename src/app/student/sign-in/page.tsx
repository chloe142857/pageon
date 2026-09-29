import Link from "next/link";

import { studentSignIn } from "../actions";

type SearchParams = Promise<{ error?: string; next?: string }>;

export default async function StudentSignInPage({ searchParams }: { searchParams: SearchParams }) {
  const { error, next } = await searchParams;

  return (
    <main className="page student-page">
      <h1>학생 로그인</h1>
      <p className="muted">선생님에게 받은 학급 코드, 학생 식별자, PIN을 입력하세요.</p>
      <form action={studentSignIn} className="card form-grid">
        <input type="hidden" name="next" value={next ?? ""} />
        {error ? <p className="danger" role="alert">{error}</p> : null}
        <label>
          학급 코드
          <input name="classroomCode" autoCapitalize="characters" autoComplete="off" required />
        </label>
        <label>
          학생 식별자
          <input name="studentIdentifier" autoCapitalize="characters" autoComplete="username" required />
        </label>
        <label>
          PIN
          <input name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,8}" minLength={4} maxLength={8} autoComplete="current-password" required />
        </label>
        <button type="submit">로그인</button>
      </form>
      <p><Link href="/teacher/sign-in">교사 로그인으로 이동</Link></p>
    </main>
  );
}
