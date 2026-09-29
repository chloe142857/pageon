import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { getStudentSession } from "@/lib/auth/student";
import { gradeSubmissionAnswers } from "@/lib/grading";
import { processSubmissionImages } from "@/lib/image-processing";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const BUCKET = "submission-originals";
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function imageExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function isUploadFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string" && typeof value.arrayBuffer === "function";
}

export async function POST(request: Request) {
  const student = await getStudentSession();
  if (!student) return NextResponse.json({ error: "학생 로그인이 필요합니다." }, { status: 401 });

  const formData = await request.formData();
  const worksheetToken = String(formData.get("worksheetToken") ?? "");
  const uploadedPages = formData.getAll("pages");
  const admin = createSupabaseAdminClient();
  const { data: worksheet } = await admin
    .from("worksheets")
    .select("id, total_pages, version_number")
    .eq("worksheet_token", worksheetToken)
    .eq("status", "published")
    .maybeSingle();

  if (!worksheet) return NextResponse.json({ error: "발행된 활동지를 찾을 수 없습니다." }, { status: 404 });
  if (uploadedPages.length !== worksheet.total_pages || !uploadedPages.every(isUploadFile)) {
    return NextResponse.json({ error: `활동지 ${worksheet.total_pages}페이지를 모두 촬영해 제출하세요.` }, { status: 400 });
  }
  if (uploadedPages.some((file) => !ACCEPTED_IMAGE_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_IMAGE_BYTES)) {
    return NextResponse.json({ error: "JPEG, PNG, WebP 형식의 12MB 이하 사진만 제출할 수 있습니다." }, { status: 400 });
  }

  const { data: submission, error: submissionError } = await admin
    .from("submissions")
    .insert({
      worksheet_id: worksheet.id,
      student_id: student.id,
      worksheet_version: worksheet.version_number,
      page_count: worksheet.total_pages,
      status: "uploading",
    })
    .select("id")
    .single();
  if (submissionError || !submission) return NextResponse.json({ error: "제출을 시작하지 못했습니다." }, { status: 500 });

  const uploadedPaths: string[] = [];
  try {
    const pageRows = [];
    for (const [index, file] of uploadedPages.entries()) {
      const pageNumber = index + 1;
      const storagePath = `${worksheet.id}/${student.id}/${submission.id}/page-${pageNumber}-${randomUUID()}.${imageExtension(file.type)}`;
      const { error: storageError } = await admin.storage.from(BUCKET).upload(storagePath, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
        upsert: false,
      });
      if (storageError) throw storageError;
      uploadedPaths.push(storagePath);
      pageRows.push({
        submission_id: submission.id,
        page_number: pageNumber,
        original_storage_path: storagePath,
        original_mime_type: file.type,
        original_byte_size: file.size,
      });
    }

    const { error: pagesError } = await admin.from("submission_pages").insert(pageRows);
    if (pagesError) throw pagesError;
    const { error: statusError } = await admin
      .from("submissions")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", submission.id);
    if (statusError) throw statusError;
  } catch {
    if (uploadedPaths.length) await admin.storage.from(BUCKET).remove(uploadedPaths);
    await admin.from("submissions").update({ status: "upload_failed" }).eq("id", submission.id);
    return NextResponse.json({ error: "원본 저장에 실패했습니다. 네트워크를 확인한 뒤 다시 제출하세요." }, { status: 500 });
  }

  let imageProcessingCompleted = false;
  try {
    await processSubmissionImages(submission.id);
    imageProcessingCompleted = true;
  } catch {
    // 원본과 제출 레코드는 이미 안전하게 보존되어 있다. 교사는 처리 실패 상태를 확인할 수 있다.
  }

  if (imageProcessingCompleted) {
    try {
      await gradeSubmissionAnswers(submission.id);
    } catch {
      // 제출 원본과 OCR 결과는 보존한다. 교사는 처리 화면에서 재확인할 수 있다.
    }
  }

  return NextResponse.json({ submissionId: submission.id }, { status: 201 });
}
