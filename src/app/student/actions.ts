"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

import {
  clearStudentSession,
  createStudentSession,
  normalizeClassroomCode,
  normalizeStudentIdentifier,
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
    studentIdentifier: formData.get("studentIdentifier"),
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
    withError("학급 코드, 학생 식별자 또는 PIN을 확인하세요.");
  }

  const { data: student } = await admin
    .from("students")
    .select("id")
    .eq("classroom_id", classroom.id)
    .eq("student_identifier", normalizeStudentIdentifier(parsed.data.studentIdentifier))
    .eq("active", true)
    .maybeSingle();

  if (!student) {
    withError("학급 코드, 학생 식별자 또는 PIN을 확인하세요.");
  }

  const { data: credentials } = await admin
    .from("student_credentials")
    .select("pin_hash")
    .eq("student_id", student.id)
    .maybeSingle();

  if (!credentials || !(await bcrypt.compare(parsed.data.pin, credentials.pin_hash))) {
    withError("학급 코드, 학생 식별자 또는 PIN을 확인하세요.");
  }

  await createStudentSession(student.id);
  redirect(returnTo);
}

export async function studentSignOut() {
  await clearStudentSession();
  redirect("/student/sign-in");
}
