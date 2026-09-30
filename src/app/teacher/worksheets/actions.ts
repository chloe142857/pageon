"use server";

import { randomBytes, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireTeacher } from "@/lib/auth/teacher";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { analyzeWorksheetText, extractPdfPages } from "@/lib/pdf-import";
import { gradeBandFor, lessonsFor, mathAreas } from "@/lib/lesson-contents";
import { generateWorksheetQuestions, generationCategories, generationTotals, type GenerationCategory } from "@/lib/worksheet-generation";
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
  generationMetadata?: { provider: string; models: string[] },
) {
  const standardIds = [...new Set(input.worksheetStandardIds)];
  const { data: standards, error: standardsError } = standardIds.length
    ? await admin.from("achievement_standards").select("id, code").in("id", standardIds)
    : { data: [], error: null };

  if (standardsError || !standards || standards.length !== standardIds.length) {
    throw new Error("선택한 성취기준을 찾을 수 없습니다.");
  }

  const { error: linkDeleteError } = await admin.from("worksheet_standards").delete().eq("worksheet_id", worksheetId);
  if (linkDeleteError) throw new Error("활동지 성취기준을 저장하지 못했습니다.");

  if (standardIds.length) {
    const { error: linkError } = await admin.from("worksheet_standards").insert(
      standardIds.map((achievementStandardId) => ({ worksheet_id: worksheetId, achievement_standard_id: achievementStandardId })),
    );
    if (linkError) throw new Error("활동지 성취기준을 저장하지 못했습니다.");
  }

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
      achievement_standard_id: null,
      page: question.page,
      question_bbox: null,
      answer_bbox: question.answerBBox,
    })))
    .select("id, question_number, type, question_text, answer, explanation, score, page, answer_bbox");

  if (questionError || !questions) throw new Error("문항을 저장하지 못했습니다.");

  const structuredContent = buildStructuredContent(
    { ...input, id: worksheetId, versionNumber, generationSource },
    questions.sort((a, b) => a.question_number - b.question_number).map((question) => ({
      id: question.id,
      type: question.type,
      category: input.questions[question.question_number - 1]?.category,
      questionText: question.question_text,
      answer: question.answer,
      explanation: question.explanation,
      score: Number(question.score),
      page: question.page,
      answerBBox: question.answer_bbox as { x: number; y: number; width: number; height: number } | null,
    })),
  );
  if (generationMetadata) Object.assign(structuredContent, { generation: generationMetadata });

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
  if (standardsError) errorRedirect("/teacher/worksheets/import", "교육과정 정보를 불러오지 못했습니다.");

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

  const analysis = analyzeWorksheetText(extracted.pages, file.name, standards ?? []);
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

export async function generateWorksheet(_previous: { error: string }, formData: FormData): Promise<{ error: string }> {
  const teacher = await requireTeacher();
  const grade = Number(formData.get("grade"));
  const semester = String(formData.get("semester") ?? "");
  const unitNumber = Number(formData.get("unitNumber"));
  const lessonNumber = Number(formData.get("lessonNumber"));
  const area = String(formData.get("area") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const total = Number(formData.get("total"));
  const counts = Object.fromEntries(generationCategories.map((category) => [category, Number(formData.get(category))])) as Record<GenerationCategory, number>;
  const standardIds = [...new Set(formData.getAll("standardIds").map(String))];
  const unit = lessonsFor(grade, semester).find((item) => item.unit_number === unitNumber);
  const lesson = unit?.lessons.find((item) => item.lesson_number === lessonNumber);

  if (!Number.isInteger(grade) || grade < 1 || grade > 6 || !["1학기", "2학기"].includes(semester) || !unit || !lesson) {
    return { error: "학년·학기·단원·차시를 모두 선택하세요." };
  }
  if (!mathAreas.includes(area as (typeof mathAreas)[number])) return { error: "영역을 확인하세요." };
  if (!title || title.length > 120) return { error: "활동지 제목을 1~120자로 입력하세요." };
  if (!generationTotals.includes(total as (typeof generationTotals)[number]) || generationCategories.some((category) => !Number.isInteger(counts[category]) || counts[category] < 0 || counts[category] > total) || generationCategories.reduce((sum, category) => sum + counts[category], 0) !== total) {
    return { error: "유형별 문항 수 합계를 선택한 전체 문항 수와 같게 맞추세요." };
  }
  const admin = createSupabaseAdminClient();
  const { data: standards, error: standardsError } = standardIds.length
    ? await admin.from("achievement_standards").select("id, code, description, grade_band, area").in("id", standardIds)
    : { data: [], error: null };
  if (standardsError || !standards || standards.length !== standardIds.length || standards.some((item) => item.grade_band !== gradeBandFor(grade) || item.area !== area)) {
    return { error: "선택한 학년·영역에 맞는 성취기준을 다시 선택하세요." };
  }

  let generated: Awaited<ReturnType<typeof generateWorksheetQuestions>>;
  try {
    generated = await generateWorksheetQuestions({ grade, semester, unitName: unit.unit_name, lessonObjective: lesson.content, area, total, counts, standards });
  } catch (error) {
    return { error: error instanceof Error ? `문항 생성 실패: ${error.message}` : "문항 생성에 실패했습니다." };
  }

  const input: WorksheetInput = {
    title, curriculumGrade: grade, gradeBand: gradeBandFor(grade), semester, area, unitName: unit.unit_name,
    lessonObjective: lesson.content, totalPages: Math.max(...generated.questions.map((question) => question.page)),
    worksheetStandardIds: standardIds, questions: generated.questions,
  };
  const { data: worksheet, error: createError } = await admin.from("worksheets").insert({
    teacher_id: teacher.id, title: input.title, grade_band: input.gradeBand, semester: input.semester,
    area: input.area, unit_name: input.unitName, lesson_objective: input.lessonObjective,
    total_pages: input.totalPages, generation_source: "manual", worksheet_token: createWorksheetToken(),
  }).select("id").single();
  if (createError || !worksheet) return { error: createError?.message ?? "활동지 초안을 저장하지 못했습니다." };

  try {
    await replaceWorksheetContent(admin, worksheet.id, input, "manual", 0, { provider: "upstage", models: generated.modelsUsed });
  } catch (error) {
    await admin.from("worksheets").delete().eq("id", worksheet.id);
    return { error: error instanceof Error ? error.message : "문항을 저장하지 못했습니다." };
  }
  revalidatePath("/teacher/worksheets");
  redirect(`/teacher/worksheets/${worksheet.id}?notice=${encodeURIComponent("AI가 활동지 초안을 생성했습니다. 문항·정답을 확인하고 수정한 뒤 발행하세요.")}`);
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
    const previousContent = worksheet.structured_content && typeof worksheet.structured_content === "object" ? worksheet.structured_content as Record<string, unknown> : {};
    const generation = previousContent.generation as { provider?: string; models?: string[] } | undefined;
    const metadata = generation?.provider === "upstage" && Array.isArray(generation.models) ? { provider: "upstage", models: generation.models } : undefined;
    await replaceWorksheetContent(admin, worksheetId, input, generationSource, worksheet.version_number, metadata);
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

export async function deleteWorksheet(formData: FormData) {
  const worksheetId = String(formData.get("worksheetId") ?? "");
  if (!worksheetId) errorRedirect("/teacher/worksheets", "잘못된 활동지 요청입니다.");

  const { admin } = await requireOwnedWorksheet(worksheetId);
  const { count, error: submissionError } = await admin
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("worksheet_id", worksheetId);
  if (submissionError) errorRedirect("/teacher/worksheets", "활동지 제출 기록을 확인하지 못했습니다.");
  if (count) errorRedirect("/teacher/worksheets", "학생 제출 기록이 있는 활동지는 삭제할 수 없습니다.");

  const { error } = await admin.from("worksheets").delete().eq("id", worksheetId);
  if (error) errorRedirect("/teacher/worksheets", "활동지를 삭제하지 못했습니다.");
  revalidatePath("/teacher");
  revalidatePath("/teacher/worksheets");
  redirect(`/teacher/worksheets?notice=${encodeURIComponent("활동지를 삭제했습니다.")}`);
}
