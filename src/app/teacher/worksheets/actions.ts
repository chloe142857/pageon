"use server";

import { randomBytes, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { analyzeWorksheetText, extractPdfPages } from "@/lib/pdf-import";
import { buildStructuredContent, parseWorksheetFormData, type GenerationSource, type WorksheetInput } from "@/lib/worksheet";

function errorRedirect(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function createWorksheetToken() {
  return randomBytes(24).toString("base64url");
}

async function requireOwnedWorksheet(worksheetId: string) {
  const teacher = await requireTeacher();
  const admin = createSupabaseAdminClient();
  const { data: worksheet } = await admin
    .from("worksheets")
    .select("id, version_number, status, structured_content, generation_source")
    .eq("id", worksheetId)
    .eq("teacher_id", teacher.id)
    .maybeSingle();

  if (!worksheet) errorRedirect("/teacher/worksheets", "활동지를 찾을 수 없습니다.");
  return { teacher, admin, worksheet };
}

async function replaceWorksheetContent(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  worksheetId: string,
  input: WorksheetInput,
  generationSource: GenerationSource,
  versionNumber: number,
) {
  const standardIds = [...new Set(input.worksheetStandardIds)];
  const { data: standards, error: standardsError } = await admin
    .from("achievement_standards")
    .select("id, code")
    .in("id", standardIds);

  if (standardsError || !standards || standards.length !== standardIds.length) {
    throw new Error("선택한 성취기준을 찾을 수 없습니다.");
  }

  const standardsById = new Map(standards.map((standard) => [standard.id, standard.code]));
  const { error: linkDeleteError } = await admin.from("worksheet_standards").delete().eq("worksheet_id", worksheetId);
  if (linkDeleteError) throw new Error("활동지 성취기준을 저장하지 못했습니다.");

  const { error: linkError } = await admin.from("worksheet_standards").insert(
    standardIds.map((achievementStandardId) => ({ worksheet_id: worksheetId, achievement_standard_id: achievementStandardId })),
  );
  if (linkError) throw new Error("활동지 성취기준을 저장하지 못했습니다.");

  const { error: questionDeleteError } = await admin.from("worksheet_questions").delete().eq("worksheet_id", worksheetId);
  if (questionDeleteError) throw new Error("기존 문항을 정리하지 못했습니다.");

  const { data: questions, error: questionError } = await admin
    .from("worksheet_questions")
    .insert(input.questions.map((question, index) => ({
      worksheet_id: worksheetId,
      question_number: index + 1,
      type: question.type,
      question_text: question.questionText,
      answer: question.answer,
      explanation: question.explanation,
      score: question.score,
      achievement_standard_id: question.achievementStandardId,
      page: question.page,
      question_bbox: null,
      answer_bbox: question.answerBBox,
    })))
    .select("id, type, question_text, answer, explanation, score, achievement_standard_id, page, answer_bbox");

  if (questionError || !questions) throw new Error("문항을 저장하지 못했습니다.");

  const structuredContent = buildStructuredContent(
    { ...input, id: worksheetId, versionNumber, generationSource },
    questions.map((question) => ({
      id: question.id,
      type: question.type,
      questionText: question.question_text,
      answer: question.answer,
      explanation: question.explanation,
      score: Number(question.score),
      achievementStandardId: question.achievement_standard_id,
      achievementStandardCode: standardsById.get(question.achievement_standard_id) ?? "",
      page: question.page,
      answerBBox: question.answer_bbox as { x: number; y: number; width: number; height: number } | null,
    })),
  );

  const { error: worksheetError } = await admin
    .from("worksheets")
    .update({
      title: input.title,
      grade_band: input.gradeBand,
      semester: input.semester,
      area: input.area,
      unit_name: input.unitName,
      lesson_objective: input.lessonObjective,
      total_pages: input.totalPages,
      generation_source: generationSource,
      structured_content: structuredContent,
    })
    .eq("id", worksheetId);

  if (worksheetError) throw new Error("활동지 정보를 저장하지 못했습니다.");
}

function sourceFromFormData(formData: FormData): GenerationSource {
  if (formData.get("generationSource") === "mock") return "mock";
  return "manual";
}

function importPath(importId: string) {
  return `/teacher/worksheets/import/${importId}`;
}

function safePdfFilename(filename: string) {
  const basename = filename.replace(/[^a-zA-Z0-9가-힣._-]/g, "-").replace(/-+/g, "-");
  return basename || "worksheet.pdf";
}

/** PDF 원본을 비공개 Storage에 보관하고, 텍스트 기반 개발용 추천 초안을 생성한다. */
export async function uploadPdfImport(formData: FormData) {
  const teacher = await requireTeacher();
  const file = formData.get("pdf");
  if (!(file instanceof File) || file.size === 0) errorRedirect("/teacher/worksheets/import", "업로드할 PDF를 선택하세요.");
  if (file.size > 10 * 1024 * 1024) errorRedirect("/teacher/worksheets/import", "PDF는 10MB 이하만 업로드할 수 있습니다.");
  if (file.type && file.type !== "application/pdf") errorRedirect("/teacher/worksheets/import", "PDF 파일만 업로드할 수 있습니다.");

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    errorRedirect("/teacher/worksheets/import", "올바른 PDF 파일이 아닙니다.");
  }

  const admin = createSupabaseAdminClient();
  const { data: standards, error: standardsError } = await admin
    .from("achievement_standards")
    .select("id, code, description, grade_band, area")
    .order("code");
  if (standardsError || !standards?.length) errorRedirect("/teacher/worksheets/import", "성취기준 데이터가 없어 PDF를 분석할 수 없습니다.");

  let extracted: { pageCount: number; pages: string[] };
  try {
    extracted = await extractPdfPages(buffer);
  } catch {
    errorRedirect("/teacher/worksheets/import", "PDF를 읽지 못했습니다. 암호화·손상 여부를 확인하세요.");
  }
  if (extracted.pageCount < 1 || extracted.pageCount > 30) {
    errorRedirect("/teacher/worksheets/import", "학생 촬영 흐름은 1~30페이지 활동지만 지원합니다.");
  }

  const importId = randomUUID();
  const originalFilename = safePdfFilename(file.name);
  const storagePath = `${teacher.id}/${importId}/${originalFilename}`;
  const { error: uploadError } = await admin.storage.from("worksheet-sources").upload(storagePath, buffer, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError) errorRedirect("/teacher/worksheets/import", `PDF 원본을 저장하지 못했습니다: ${uploadError.message}`);

  const analysis = analyzeWorksheetText(extracted.pages, file.name, standards);
  const { error: insertError } = await admin.from("worksheet_imports").insert({
    id: importId,
    teacher_id: teacher.id,
    original_filename: file.name,
    original_storage_path: storagePath,
    original_byte_size: file.size,
    page_count: extracted.pageCount,
    extracted_text: extracted.pages.join("\n\n").slice(0, 100_000),
    analysis,
    analysis_mode: "heuristic_mock",
  });
  if (insertError) {
    await admin.storage.from("worksheet-sources").remove([storagePath]);
    errorRedirect("/teacher/worksheets/import", `PDF 분석 초안을 저장하지 못했습니다: ${insertError.message}`);
  }

  redirect(`${importPath(importId)}?notice=${encodeURIComponent("PDF를 분석했습니다. 아래 추천은 확정값이 아니므로 문항·정답·성취기준을 모두 확인하세요.")}`);
}

/** 교사가 확정한 PDF 분석 초안을 기존 worksheets / worksheet_questions 구조로 등록한다. */
export async function createWorksheetFromImport(formData: FormData) {
  const importId = String(formData.get("importId") ?? "");
  if (!importId) errorRedirect("/teacher/worksheets/import", "잘못된 PDF 분석 요청입니다.");
  const teacher = await requireTeacher();
  const admin = createSupabaseAdminClient();
  const { data: pdfImport } = await admin
    .from("worksheet_imports")
    .select("id, status, worksheet_id")
    .eq("id", importId)
    .eq("teacher_id", teacher.id)
    .maybeSingle();
  if (!pdfImport) errorRedirect("/teacher/worksheets/import", "PDF 분석 초안을 찾을 수 없습니다.");
  if (pdfImport.status === "registered" && pdfImport.worksheet_id) {
    redirect(`/teacher/worksheets/${pdfImport.worksheet_id}`);
  }

  let input: WorksheetInput;
  try {
    input = parseWorksheetFormData(formData);
  } catch (error) {
    errorRedirect(importPath(importId), error instanceof Error ? error.message : "활동지 입력을 확인하세요.");
  }

  const { data: worksheet, error } = await admin
    .from("worksheets")
    .insert({
      teacher_id: teacher.id,
      title: input.title,
      grade_band: input.gradeBand,
      semester: input.semester,
      area: input.area,
      unit_name: input.unitName,
      lesson_objective: input.lessonObjective,
      total_pages: input.totalPages,
      generation_source: "pdf_import",
      worksheet_token: createWorksheetToken(),
    })
    .select("id")
    .single();
  if (error || !worksheet) errorRedirect(importPath(importId), error?.message ?? "활동지를 만들지 못했습니다.");

  try {
    await replaceWorksheetContent(admin, worksheet.id, input, "pdf_import", 0);
    const { error: importError } = await admin
      .from("worksheet_imports")
      .update({ worksheet_id: worksheet.id, status: "registered", error_message: null })
      .eq("id", importId)
      .eq("teacher_id", teacher.id);
    if (importError) throw importError;
  } catch (contentError) {
    await admin.from("worksheets").delete().eq("id", worksheet.id);
    errorRedirect(importPath(importId), contentError instanceof Error ? contentError.message : "문항을 저장하지 못했습니다.");
  }

  revalidatePath("/teacher");
  revalidatePath("/teacher/worksheets");
  revalidatePath(importPath(importId));
  redirect(`/teacher/worksheets/${worksheet.id}?notice=${encodeURIComponent("기존 PDF 활동지를 초안으로 등록했습니다. 내용을 마지막으로 확인한 뒤 발행하세요.")}`);
}

export async function createWorksheet(formData: FormData) {
  const teacher = await requireTeacher();
  let input: WorksheetInput;
  try {
    input = parseWorksheetFormData(formData);
  } catch (error) {
    errorRedirect("/teacher/worksheets/new", error instanceof Error ? error.message : "활동지 입력을 확인하세요.");
  }

  const admin = createSupabaseAdminClient();
  const generationSource = sourceFromFormData(formData);
  const { data: worksheet, error } = await admin
    .from("worksheets")
    .insert({
      teacher_id: teacher.id,
      title: input.title,
      grade_band: input.gradeBand,
      semester: input.semester,
      area: input.area,
      unit_name: input.unitName,
      lesson_objective: input.lessonObjective,
      total_pages: input.totalPages,
      generation_source: generationSource,
      worksheet_token: createWorksheetToken(),
    })
    .select("id")
    .single();

  if (error || !worksheet) errorRedirect("/teacher/worksheets/new", error?.message ?? "활동지를 만들지 못했습니다.");

  try {
    await replaceWorksheetContent(admin, worksheet.id, input, generationSource, 0);
  } catch (contentError) {
    await admin.from("worksheets").delete().eq("id", worksheet.id);
    errorRedirect("/teacher/worksheets/new", contentError instanceof Error ? contentError.message : "문항을 저장하지 못했습니다.");
  }

  revalidatePath("/teacher");
  revalidatePath("/teacher/worksheets");
  redirect(`/teacher/worksheets/${worksheet.id}?notice=${encodeURIComponent("활동지 초안을 저장했습니다.")}`);
}

export async function saveWorksheet(formData: FormData) {
  const worksheetId = String(formData.get("worksheetId") ?? "");
  if (!worksheetId) errorRedirect("/teacher/worksheets", "잘못된 요청입니다.");

  const { admin, worksheet } = await requireOwnedWorksheet(worksheetId);
  const generationSource: GenerationSource = worksheet.generation_source === "pdf_import" ? "pdf_import" : sourceFromFormData(formData);
  let input: WorksheetInput;
  try {
    input = parseWorksheetFormData(formData);
  } catch (error) {
    errorRedirect(`/teacher/worksheets/${worksheetId}`, error instanceof Error ? error.message : "활동지 입력을 확인하세요.");
  }

  try {
    await replaceWorksheetContent(admin, worksheetId, input, generationSource, worksheet.version_number);
    if (worksheet.status === "published") {
      const { error } = await admin.from("worksheets").update({ status: "draft", published_at: null }).eq("id", worksheetId);
      if (error) throw error;
    }
  } catch (contentError) {
    errorRedirect(`/teacher/worksheets/${worksheetId}`, contentError instanceof Error ? contentError.message : "활동지를 저장하지 못했습니다.");
  }

  revalidatePath("/teacher/worksheets");
  revalidatePath(`/teacher/worksheets/${worksheetId}`);
  redirect(`/teacher/worksheets/${worksheetId}?notice=${encodeURIComponent(worksheet.status === "published" ? "수정본을 초안으로 저장했습니다. QR을 사용하려면 다시 발행하세요." : "활동지 초안을 저장했습니다.")}`);
}

export async function publishWorksheet(formData: FormData) {
  const worksheetId = String(formData.get("worksheetId") ?? "");
  if (!worksheetId) errorRedirect("/teacher/worksheets", "잘못된 요청입니다.");

  const { admin, worksheet } = await requireOwnedWorksheet(worksheetId);
  const { count } = await admin
    .from("worksheet_questions")
    .select("id", { count: "exact", head: true })
    .eq("worksheet_id", worksheetId);
  if (!count) errorRedirect(`/teacher/worksheets/${worksheetId}`, "문항을 하나 이상 저장한 뒤 발행하세요.");

  const nextVersion = worksheet.version_number + 1;
  const previousContent = worksheet.structured_content && typeof worksheet.structured_content === "object"
    ? worksheet.structured_content as Record<string, unknown>
    : {};
  const previousWorksheet = previousContent.worksheet && typeof previousContent.worksheet === "object"
    ? previousContent.worksheet as Record<string, unknown>
    : {};
  const { error } = await admin
    .from("worksheets")
    .update({
      status: "published",
      version_number: nextVersion,
      published_at: new Date().toISOString(),
      worksheet_token: createWorksheetToken(),
      structured_content: { ...previousContent, worksheet: { ...previousWorksheet, version_number: nextVersion } },
    })
    .eq("id", worksheetId);
  if (error) errorRedirect(`/teacher/worksheets/${worksheetId}`, error.message);

  revalidatePath("/teacher/worksheets");
  revalidatePath(`/teacher/worksheets/${worksheetId}`);
  redirect(`/teacher/worksheets/${worksheetId}?notice=${encodeURIComponent("활동지를 발행했습니다. 인쇄용 PDF와 QR을 사용할 수 있습니다.")}`);
}
