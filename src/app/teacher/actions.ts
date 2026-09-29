"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  classroomInputSchema,
  studentInputSchema,
  studentUpdateSchema,
} from "@/lib/validation";

function errorRedirect(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function createJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  return Array.from(randomBytes(8), (byte) => alphabet[byte & 31]).join("");
}

async function requireOwnedClassroom(classroomId: string) {
  const teacher = await requireTeacher();
  const admin = createSupabaseAdminClient();
  const { data: classroom } = await admin
    .from("classrooms")
    .select("id")
    .eq("id", classroomId)
    .eq("teacher_id", teacher.id)
    .maybeSingle();

  if (!classroom) {
    errorRedirect("/teacher/classrooms", "학급을 찾을 수 없습니다.");
  }

  return { teacher, admin };
}

export async function createClassroom(formData: FormData) {
  const teacher = await requireTeacher();
  const parsed = classroomInputSchema.safeParse({
    name: formData.get("name"),
    schoolYear: formData.get("schoolYear") || "",
  });

  if (!parsed.success) {
    errorRedirect("/teacher/classrooms", parsed.error.issues[0].message);
  }

  const admin = createSupabaseAdminClient();
  let lastError = "학급을 만들지 못했습니다.";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await admin.from("classrooms").insert({
      teacher_id: teacher.id,
      name: parsed.data.name,
      school_year: parsed.data.schoolYear ?? "",
      join_code: createJoinCode(),
    });

    if (!error) {
      revalidatePath("/teacher");
      revalidatePath("/teacher/classrooms");
      redirect("/teacher/classrooms");
    }

    lastError = error.message;
  }

  errorRedirect("/teacher/classrooms", lastError);
}

export async function updateClassroom(formData: FormData) {
  const classroomId = String(formData.get("classroomId") ?? "");
  const parsed = classroomInputSchema.safeParse({
    name: formData.get("name"),
    schoolYear: formData.get("schoolYear") || "",
  });

  if (!classroomId || !parsed.success) {
    errorRedirect(`/teacher/classrooms/${classroomId}`, parsed.success ? "잘못된 요청입니다." : parsed.error.issues[0].message);
  }

  const { admin } = await requireOwnedClassroom(classroomId);
  const { error } = await admin
    .from("classrooms")
    .update({ name: parsed.data.name, school_year: parsed.data.schoolYear ?? "" })
    .eq("id", classroomId);

  if (error) {
    errorRedirect(`/teacher/classrooms/${classroomId}`, error.message);
  }

  revalidatePath("/teacher");
  revalidatePath("/teacher/classrooms");
  revalidatePath(`/teacher/classrooms/${classroomId}`);
  redirect(`/teacher/classrooms/${classroomId}?notice=${encodeURIComponent("학급 정보를 저장했습니다.")}`);
}

export async function createStudent(formData: FormData) {
  const classroomId = String(formData.get("classroomId") ?? "");
  const parsed = studentInputSchema.safeParse({
    displayName: formData.get("displayName"),
    studentNumber: formData.get("studentNumber"),
    studentIdentifier: formData.get("studentIdentifier"),
    pin: formData.get("pin"),
  });

  if (!classroomId || !parsed.success) {
    errorRedirect(`/teacher/classrooms/${classroomId}`, parsed.success ? "잘못된 요청입니다." : parsed.error.issues[0].message);
  }

  const { admin } = await requireOwnedClassroom(classroomId);
  const { data: student, error: studentError } = await admin
    .from("students")
    .insert({
      classroom_id: classroomId,
      display_name: parsed.data.displayName,
      student_number: parsed.data.studentNumber,
      student_identifier: parsed.data.studentIdentifier,
    })
    .select("id")
    .single();

  if (studentError || !student) {
    errorRedirect(`/teacher/classrooms/${classroomId}`, studentError?.message ?? "학생을 등록하지 못했습니다.");
  }

  const pinHash = await bcrypt.hash(parsed.data.pin, 12);
  const { error: credentialError } = await admin
    .from("student_credentials")
    .insert({ student_id: student.id, pin_hash: pinHash });

  if (credentialError) {
    await admin.from("students").delete().eq("id", student.id);
    errorRedirect(`/teacher/classrooms/${classroomId}`, "학생 PIN을 저장하지 못했습니다.");
  }

  revalidatePath("/teacher");
  revalidatePath(`/teacher/classrooms/${classroomId}`);
  redirect(`/teacher/classrooms/${classroomId}?notice=${encodeURIComponent("학생을 등록했습니다.")}`);
}

export async function updateStudent(formData: FormData) {
  const classroomId = String(formData.get("classroomId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  const parsed = studentUpdateSchema.safeParse({
    displayName: formData.get("displayName"),
    studentNumber: formData.get("studentNumber"),
    studentIdentifier: formData.get("studentIdentifier"),
    pin: formData.get("pin") || "",
  });

  if (!classroomId || !studentId || !parsed.success) {
    errorRedirect(`/teacher/classrooms/${classroomId}`, parsed.success ? "잘못된 요청입니다." : parsed.error.issues[0].message);
  }

  const { admin } = await requireOwnedClassroom(classroomId);
  const { error: studentError } = await admin
    .from("students")
    .update({
      display_name: parsed.data.displayName,
      student_number: parsed.data.studentNumber,
      student_identifier: parsed.data.studentIdentifier,
      active: formData.get("active") === "on",
    })
    .eq("id", studentId)
    .eq("classroom_id", classroomId);

  if (studentError) {
    errorRedirect(`/teacher/classrooms/${classroomId}`, studentError.message);
  }

  if (parsed.data.pin) {
    const pinHash = await bcrypt.hash(parsed.data.pin, 12);
    const { error: credentialError } = await admin
      .from("student_credentials")
      .update({ pin_hash: pinHash })
      .eq("student_id", studentId);

    if (credentialError) {
      errorRedirect(`/teacher/classrooms/${classroomId}`, "학생 정보는 저장됐지만 PIN 변경에 실패했습니다.");
    }
  }

  revalidatePath("/teacher");
  revalidatePath(`/teacher/classrooms/${classroomId}`);
  redirect(`/teacher/classrooms/${classroomId}?notice=${encodeURIComponent("학생 정보를 저장했습니다.")}`);
}
