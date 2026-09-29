"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

import {
  clearStudentSession,
  createStudentSession,
  normalizeClassroomCode,
} from "@/lib/auth/student";
import { getSafeStudentReturnPath } from "@/lib/student-return-path";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { studentSignInSchema } from "@/lib/validation";

function withError(message: string): never {
  redirect(`/student/sign-in?error=${encodeURIComponent(message)}`);
}

export async function studentSignIn(formData: FormData) {
  const returnTo = getSafeStudentReturnPath(String(formData.get("next") ?? ""));
  const parsed = studentSignInSchema.safeParse({
    classroomCode: formData.get("classroomCode"),
    studentNumber: formData.get("studentNumber"),
    displayName: formData.get("displayName"),
    pin: formData.get("pin"),
  });

  if (!parsed.success) {
    withError(parsed.error.issues[0].message);
  }

  const admin = createSupabaseAdminClient();
  const { data: classroom } = await admin
    .from("classrooms")
    .select("id")
    .eq("join_code", normalizeClassroomCode(parsed.data.classroomCode))
    .is("archived_at", null)
    .maybeSingle();

  if (!classroom) {
    withError("학급 코드, 번호, 이름 또는 비밀번호를 확인하세요.");
  }

  const { data: student } = await admin
    .from("students")
    .select("id")
    .eq("classroom_id", classroom.id)
    .eq("student_number", parsed.data.studentNumber)
    .eq("display_name", parsed.data.displayName)
    .eq("active", true)
    .maybeSingle();

  if (!student) {
    withError("학급 코드, 번호, 이름 또는 비밀번호를 확인하세요.");
  }

  const { data: credentials } = await admin
    .from("student_credentials")
    .select("pin_hash")
    .eq("student_id", student.id)
    .maybeSingle();

  if (!credentials || !(await bcrypt.compare(parsed.data.pin, credentials.pin_hash))) {
    withError("학급 코드, 번호, 이름 또는 비밀번호를 확인하세요.");
  }

  await createStudentSession(student.id);
  redirect(returnTo);
}

export async function studentSignOut() {
  await clearStudentSession();
  redirect("/student/sign-in");
}
