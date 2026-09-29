import { createHash, randomBytes } from "crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/lib/supabase/server";

const STUDENT_SESSION_COOKIE = "pageon_student_session";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 12;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeClassroomCode(value: string) {
  return value.trim().toUpperCase();
}

export function normalizeStudentIdentifier(value: string) {
  return value.trim().toUpperCase();
}

export async function createStudentSession(studentId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000);
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("student_sessions").insert({
    student_id: studentId,
    token_hash: hashToken(token),
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    throw new Error("학생 세션을 만들지 못했습니다.");
  }

  const cookieStore = await cookies();
  cookieStore.set(STUDENT_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function clearStudentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(STUDENT_SESSION_COOKIE)?.value;

  if (token) {
    const admin = createSupabaseAdminClient();
    await admin
      .from("student_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", hashToken(token));
  }

  cookieStore.delete(STUDENT_SESSION_COOKIE);
}

export async function getStudentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(STUDENT_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const { data: session } = await admin
    .from("student_sessions")
    .select("student_id, expires_at, revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (
    !session ||
    session.revoked_at ||
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    return null;
  }

  const { data: student } = await admin
    .from("students")
    .select("id, display_name, student_number, student_identifier, active, classrooms(name)")
    .eq("id", session.student_id)
    .eq("active", true)
    .maybeSingle();

  return student;
}

export async function requireStudentSession(returnTo = "/student") {
  const student = await getStudentSession();

  if (!student) {
    redirect(`/student/sign-in?next=${encodeURIComponent(returnTo)}`);
  }

  return student;
}
