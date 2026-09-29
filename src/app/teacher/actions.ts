"use server";

import bcrypt from "bcryptjs";
import { createHash } from "crypto";
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

function internalStudentIdentifier(studentNumber: number, displayName: string) {
  return `${studentNumber}-${createHash("sha256").update(displayName.trim()).digest("hex").slice(0, 12).toUpperCase()}`;
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
    joinCode: formData.get("joinCode"),
  });

  if (!parsed.success) {
    errorRedirect("/teacher/classrooms", parsed.error.issues[0].message);
  }

  const admin = createSupabaseAdminClient();
  const { data: duplicate } = await admin
    .from("classrooms")
    .select("id")
    .eq("teacher_id", teacher.id)
    .eq("name", parsed.data.name)
    .eq("school_year", parsed.data.schoolYear ?? "")
    .is("archived_at", null)
    .maybeSingle();
  if (duplicate) {
    errorRedirect("/teacher/classrooms", "같은 학년도와 이름의 학급이 이미 있습니다.");
  }
  const { error } = await admin.from("classrooms").insert({
    teacher_id: teacher.id,
    name: parsed.data.name,
    school_year: parsed.data.schoolYear ?? "",
    join_code: parsed.data.joinCode,
  });
  if (error) {
    if (error.code === "23505") errorRedirect("/teacher/classrooms", "같은 이름의 학급 또는 학급 코드가 이미 있습니다.");
    errorRedirect("/teacher/classrooms", "학급을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  revalidatePath("/teacher");
  revalidatePath("/teacher/classrooms");
  redirect(`/teacher/classrooms?notice=${encodeURIComponent("학급을 만들었습니다.")}`);
}

export async function updateClassroom(formData: FormData) {
  const classroomId = String(formData.get("classroomId") ?? "");
  const parsed = classroomInputSchema.safeParse({
    name: formData.get("name"),
    schoolYear: formData.get("schoolYear") || "",
    joinCode: formData.get("joinCode"),
  });

  if (!classroomId || !parsed.success) {
    errorRedirect(`/teacher/classrooms/${classroomId}`, parsed.success ? "잘못된 요청입니다." : parsed.error.issues[0].message);
  }

  const { admin, teacher } = await requireOwnedClassroom(classroomId);
  const { data: duplicate } = await admin
    .from("classrooms")
    .select("id")
    .eq("teacher_id", teacher.id)
    .eq("name", parsed.data.name)
    .eq("school_year", parsed.data.schoolYear ?? "")
    .is("archived_at", null)
    .neq("id", classroomId)
    .maybeSingle();
  if (duplicate) {
    errorRedirect(`/teacher/classrooms/${classroomId}`, "같은 학년도와 이름의 학급이 이미 있습니다.");
  }
  const { error } = await admin
    .from("classrooms")
    .update({ name: parsed.data.name, school_year: parsed.data.schoolYear ?? "", join_code: parsed.data.joinCode })
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
      student_identifier: internalStudentIdentifier(parsed.data.studentNumber, parsed.data.displayName),
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
    errorRedirect(`/teacher/classrooms/${classroomId}`, "학생 비밀번호를 저장하지 못했습니다.");
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
      student_identifier: internalStudentIdentifier(parsed.data.studentNumber, parsed.data.displayName),
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
      errorRedirect(`/teacher/classrooms/${classroomId}`, "학생 정보는 저장됐지만 비밀번호 변경에 실패했습니다.");
    }
  }

  revalidatePath("/teacher");
  revalidatePath(`/teacher/classrooms/${classroomId}`);
  redirect(`/teacher/classrooms/${classroomId}?notice=${encodeURIComponent("학생 정보를 저장했습니다.")}`);
}

function csvRows(file: File) {
  const text = file.size ? file.text() : Promise.resolve("");
  return text.then((value) => value.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(1).map((line, index) => {
    const [studentNumber, displayName, pin] = line.split(",").map((cell) => cell.trim());
    const parsed = studentInputSchema.safeParse({ studentNumber, displayName, pin });
    if (!parsed.success) throw new Error(`${index + 2}번째 줄: ${parsed.error.issues[0]?.message ?? "입력을 확인하세요."}`);
    return parsed.data;
  }));
}

export async function importStudents(formData: FormData) {
  const classroomId = String(formData.get("classroomId") ?? "");
  const file = formData.get("studentList");
  if (!classroomId || !(file instanceof File) || file.size === 0) errorRedirect(`/teacher/classrooms/${classroomId}`, "작성한 CSV 파일을 선택하세요.");
  if (file.size > 512 * 1024) errorRedirect(`/teacher/classrooms/${classroomId}`, "명단 파일은 500KB 이하로 올려 주세요.");
  const { admin } = await requireOwnedClassroom(classroomId);
  let rows: Array<{ displayName: string; studentNumber: number; pin: string }>;
  try {
    rows = await csvRows(file);
  } catch (error) {
    errorRedirect(`/teacher/classrooms/${classroomId}`, error instanceof Error ? error.message : "명단 파일을 읽지 못했습니다.");
  }
  if (!rows.length) errorRedirect(`/teacher/classrooms/${classroomId}`, "등록할 학생이 없습니다.");
  if (rows.length > 100) errorRedirect(`/teacher/classrooms/${classroomId}`, "한 번에 최대 100명까지 등록할 수 있습니다.");
  if (new Set(rows.map((row) => row.studentNumber)).size !== rows.length) errorRedirect(`/teacher/classrooms/${classroomId}`, "명단 안에 중복된 학생 번호가 있습니다.");
  const { data: existing } = await admin.from("students").select("student_number").eq("classroom_id", classroomId).in("student_number", rows.map((row) => row.studentNumber));
  if (existing?.length) errorRedirect(`/teacher/classrooms/${classroomId}`, `${existing.map((student) => student.student_number).join(", ")}번은 이미 등록되어 있습니다.`);
  const { data: students, error } = await admin.from("students").insert(rows.map((row) => ({ classroom_id: classroomId, display_name: row.displayName, student_number: row.studentNumber, student_identifier: internalStudentIdentifier(row.studentNumber, row.displayName) }))).select("id, student_number");
  if (error || !students) errorRedirect(`/teacher/classrooms/${classroomId}`, "학생 명단을 등록하지 못했습니다.");
  const byNumber = new Map(rows.map((row) => [row.studentNumber, row]));
  const credentials = await Promise.all(students.map(async (student) => ({ student_id: student.id, pin_hash: await bcrypt.hash(byNumber.get(student.student_number)!.pin, 12) })));
  const { error: credentialError } = await admin.from("student_credentials").insert(credentials);
  if (credentialError) {
    await admin.from("students").delete().in("id", students.map((student) => student.id));
    errorRedirect(`/teacher/classrooms/${classroomId}`, "학생 비밀번호를 저장하지 못했습니다.");
  }
  revalidatePath("/teacher");
  revalidatePath(`/teacher/classrooms/${classroomId}`);
  redirect(`/teacher/classrooms/${classroomId}?notice=${encodeURIComponent(`${students.length}명의 학생을 등록했습니다.`)}`);
}

export async function deleteClassroom(formData: FormData) {
  const classroomId = String(formData.get("classroomId") ?? "");
  const { admin } = await requireOwnedClassroom(classroomId);
  const { data: students } = await admin.from("students").select("id").eq("classroom_id", classroomId);
  const studentIds = (students ?? []).map((student) => student.id);
  const { count } = studentIds.length ? await admin.from("submissions").select("id", { count: "exact", head: true }).in("student_id", studentIds) : { count: 0 };
  if (count) errorRedirect(`/teacher/classrooms/${classroomId}`, "제출 기록이 있는 학급은 삭제할 수 없습니다.");
  const { error } = await admin.from("classrooms").delete().eq("id", classroomId);
  if (error) errorRedirect(`/teacher/classrooms/${classroomId}`, "학급을 삭제하지 못했습니다. 제출 기록이 있으면 삭제할 수 없습니다.");
  revalidatePath("/teacher");
  revalidatePath("/teacher/classrooms");
  redirect(`/teacher/classrooms?notice=${encodeURIComponent("학급을 삭제했습니다.")}`);
}
