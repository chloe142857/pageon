/* eslint-disable @typescript-eslint/no-explicit-any -- OpenCV.js publishes incomplete runtime type declarations. */

import cvModule from "@techstark/opencv-js";
import sharp from "sharp";
import { createWorker } from "tesseract.js";

import type { NormalizedBox } from "./worksheet";

const PROCESSED_BUCKET = "submission-processed";

type Cv = typeof cvModule & Record<string, any>;
type Point = { x: number; y: number };

export type ProcessedDocument = {
  buffer: Buffer;
  width: number;
  height: number;
  documentCorners: Point[] | null;
  transforms: Array<Record<string, unknown>>;
};

let cvPromise: Promise<Cv> | undefined;

async function getCv() {
  if (!cvPromise) {
    const opencvModule = cvModule as Cv | Promise<Cv>;
    cvPromise = opencvModule instanceof Promise
      ? opencvModule
      : opencvModule.Mat
        ? Promise.resolve(opencvModule)
        : new Promise<Cv>((resolve) => {
            opencvModule.onRuntimeInitialized = () => resolve(opencvModule);
          });
  }
  return cvPromise;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function orderCorners(points: Point[]) {
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDifference = [...points].sort((a, b) => a.x - a.y - (b.x - b.y));
  return {
    topLeft: bySum[0],
    bottomRight: bySum[3],
    topRight: byDifference[3],
    bottomLeft: byDifference[0],
  };
}

function findDocumentCorners(cv: Cv, source: any): Point[] | null {
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    cv.cvtColor(source, gray, cv.COLOR_RGB2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 60, 180);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    let largest: Point[] | null = null;
    let largestArea = source.cols * source.rows * 0.2;
    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index);
      const approximation = new cv.Mat();
      try {
        const perimeter = cv.arcLength(contour, true);
        cv.approxPolyDP(contour, approximation, 0.02 * perimeter, true);
        const area = Math.abs(cv.contourArea(contour));
        if (approximation.rows === 4 && area > largestArea) {
          const values = Array.from(approximation.data32S as Int32Array);
          largest = [0, 1, 2, 3].map((pointIndex) => ({ x: values[pointIndex * 2], y: values[pointIndex * 2 + 1] }));
          largestArea = area;
        }
      } finally {
        contour.delete();
        approximation.delete();
      }
    }
    return largest;
  } finally {
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }
}

function estimateDeskewAngle(cv: Cv, source: any) {
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const lines = new cv.Mat();
  try {
    cv.cvtColor(source, gray, cv.COLOR_RGB2GRAY);
    cv.Canny(gray, edges, 70, 200);
    cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 90, Math.max(80, source.cols * 0.2), 20);
    const angles: number[] = [];
    const values = Array.from(lines.data32S as Int32Array);
    for (let index = 0; index + 3 < values.length; index += 4) {
      const angle = Math.atan2(values[index + 3] - values[index + 1], values[index + 2] - values[index]) * 180 / Math.PI;
      const horizontalAngle = angle > 45 ? angle - 90 : angle < -45 ? angle + 90 : angle;
      if (Math.abs(horizontalAngle) <= 8) angles.push(horizontalAngle);
    }
    if (!angles.length) return 0;
    angles.sort((a, b) => a - b);
    return angles[Math.floor(angles.length / 2)];
  } finally {
    gray.delete();
    edges.delete();
    lines.delete();
  }
}

/** 원본은 절대 수정하지 않고, 보정된 별도 JPEG 버퍼만 생성한다. */
export async function processDocumentImage(original: Buffer): Promise<ProcessedDocument> {
  const autoRotated = await sharp(original).rotate().removeAlpha().jpeg({ quality: 94 }).toBuffer();
  const { data, info } = await sharp(autoRotated).raw().toBuffer({ resolveWithObject: true });
  const transforms: Array<Record<string, unknown>> = [{ step: "rotation_correction", method: "EXIF auto-rotate" }];
  let finalBuffer = autoRotated;
  let finalWidth = info.width;
  let finalHeight = info.height;
  let documentCorners: Point[] | null = null;

  try {
    const cv = await getCv();
    const source = cv.matFromArray(info.height, info.width, cv.CV_8UC3, new Uint8Array(data));
    let transformed = source;
    try {
      const corners = findDocumentCorners(cv, source);
      if (corners) {
        const ordered = orderCorners(corners);
        const width = Math.max(1, Math.round(Math.max(distance(ordered.topLeft, ordered.topRight), distance(ordered.bottomLeft, ordered.bottomRight))));
        const height = Math.max(1, Math.round(Math.max(distance(ordered.topLeft, ordered.bottomLeft), distance(ordered.topRight, ordered.bottomRight))));
        const sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
          ordered.topLeft.x, ordered.topLeft.y,
          ordered.topRight.x, ordered.topRight.y,
          ordered.bottomRight.x, ordered.bottomRight.y,
          ordered.bottomLeft.x, ordered.bottomLeft.y,
        ]);
        const targetPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width - 1, 0, width - 1, height - 1, 0, height - 1]);
        const matrix = cv.getPerspectiveTransform(sourcePoints, targetPoints);
        const warped = new cv.Mat();
        cv.warpPerspective(source, warped, matrix, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
        sourcePoints.delete();
        targetPoints.delete();
        matrix.delete();
        transformed = warped;
        documentCorners = corners;
        transforms.push({ step: "document_detection", method: "largest four-corner contour", detected: true });
        transforms.push({ step: "perspective_correction", applied: true, width, height });
      } else {
        transforms.push({ step: "document_detection", method: "largest four-corner contour", detected: false });
        transforms.push({ step: "perspective_correction", applied: false });
      }

      const deskewAngle = estimateDeskewAngle(cv, transformed);
      if (Math.abs(deskewAngle) >= 0.25) {
        const center = new cv.Point(transformed.cols / 2, transformed.rows / 2);
        const rotation = cv.getRotationMatrix2D(center, deskewAngle, 1);
        const deskewed = new cv.Mat();
        cv.warpAffine(transformed, deskewed, rotation, new cv.Size(transformed.cols, transformed.rows), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
        rotation.delete();
        if (transformed !== source) transformed.delete();
        transformed = deskewed;
      }
      transforms.push({ step: "deskew", angle_degrees: Number(deskewAngle.toFixed(2)) });
      finalWidth = transformed.cols;
      finalHeight = transformed.rows;
      finalBuffer = await sharp(Buffer.from(transformed.data), { raw: { width: finalWidth, height: finalHeight, channels: 3 } })
        .normalise()
        .sharpen()
        .jpeg({ quality: 94 })
        .toBuffer();
    } finally {
      if (transformed !== source) transformed.delete();
      source.delete();
    }
  } catch (error) {
    transforms.push({ step: "opencv_fallback", reason: error instanceof Error ? error.message : "OpenCV 처리 실패" });
    transforms.push({ step: "deskew", applied: false });
  }

  return { buffer: finalBuffer, width: finalWidth, height: finalHeight, documentCorners, transforms };
}

export async function cropAnswerImage(processed: Buffer, bbox: NormalizedBox | null) {
  if (!bbox) return { buffer: processed, cropSource: "page_fallback" as const, cropBBox: null };
  const metadata = await sharp(processed).metadata();
  if (!metadata.width || !metadata.height) throw new Error("처리된 이미지 크기를 읽지 못했습니다.");
  const left = Math.max(0, Math.floor(metadata.width * bbox.x));
  const top = Math.max(0, Math.floor(metadata.height * bbox.y));
  const width = Math.min(metadata.width - left, Math.max(1, Math.round(metadata.width * bbox.width)));
  const height = Math.min(metadata.height - top, Math.max(1, Math.round(metadata.height * bbox.height)));
  return {
    buffer: await sharp(processed).extract({ left, top, width, height }).jpeg({ quality: 94 }).toBuffer(),
    cropSource: "template_bbox" as const,
    cropBBox: bbox,
  };
}

export async function recognizeAnswerImage(image: Buffer) {
  const worker = await createWorker("eng");
  try {
    const result = await worker.recognize(image);
    return {
      text: result.data.text.trim(),
      confidence: Number(result.data.confidence.toFixed(2)),
      engine: "tesseract.js eng",
      error: null,
    };
  } catch (error) {
    return {
      text: null,
      confidence: null,
      engine: "tesseract.js eng",
      error: error instanceof Error ? error.message : "OCR 처리 실패",
    };
  } finally {
    await worker.terminate();
  }
}

export async function processSubmissionImages(submissionId: string) {
  const { createSupabaseAdminClient } = await import("./supabase/server");
  const admin = createSupabaseAdminClient();
  const { data: submission } = await admin.from("submissions").select("id, worksheet_id").eq("id", submissionId).maybeSingle();
  if (!submission) throw new Error("제출물을 찾을 수 없습니다.");
  await admin.from("submissions").update({ image_processing_status: "processing", image_processing_error: null, image_processing_started_at: new Date().toISOString() }).eq("id", submissionId);

  try {
    const [{ data: pages }, { data: questions }] = await Promise.all([
      admin.from("submission_pages").select("id, page_number, original_storage_path").eq("submission_id", submissionId).order("page_number"),
      admin.from("worksheet_questions").select("id, page, answer_bbox").eq("worksheet_id", submission.worksheet_id).order("question_number"),
    ]);
    if (!pages?.length) throw new Error("제출 페이지를 찾을 수 없습니다.");

    for (const page of pages) {
      const { data: original, error: originalError } = await admin.storage.from("submission-originals").download(page.original_storage_path);
      if (originalError || !original) throw new Error("제출 원본을 읽지 못했습니다.");
      const processed = await processDocumentImage(Buffer.from(await original.arrayBuffer()));
      const processedPath = `${submissionId}/pages/page-${page.page_number}.jpg`;
      const { error: processedUploadError } = await admin.storage.from(PROCESSED_BUCKET).upload(processedPath, processed.buffer, { contentType: "image/jpeg", upsert: true });
      if (processedUploadError) throw processedUploadError;
      const { error: pageUpdateError } = await admin.from("submission_pages").update({
        processed_storage_path: processedPath,
        processed_mime_type: "image/jpeg",
        document_corners: processed.documentCorners,
        applied_transforms: [...processed.transforms, { step: "template_alignment", method: "normalized answer bbox" }],
        processed_at: new Date().toISOString(),
      }).eq("id", page.id);
      if (pageUpdateError) throw pageUpdateError;

      const questionsOnPage = questions?.filter((question) => question.page === page.page_number) ?? [];
      for (const question of questionsOnPage) {
        const crop = await cropAnswerImage(processed.buffer, question.answer_bbox as NormalizedBox | null);
        const answerPath = `${submissionId}/answers/${question.id}.jpg`;
        const { error: answerUploadError } = await admin.storage.from(PROCESSED_BUCKET).upload(answerPath, crop.buffer, { contentType: "image/jpeg", upsert: true });
        if (answerUploadError) throw answerUploadError;
        const recognition = await recognizeAnswerImage(crop.buffer);
        const { error: answerError } = await admin.from("submission_answers").upsert({
          submission_page_id: page.id,
          question_id: question.id,
          crop_bbox: crop.cropBBox,
          crop_source: crop.cropSource,
          answer_storage_path: answerPath,
          recognized_text: recognition.text,
          recognition_confidence: recognition.confidence,
          recognition_engine: recognition.engine,
          recognition_error: recognition.error,
        }, { onConflict: "submission_page_id,question_id" });
        if (answerError) throw answerError;
      }
    }
    await admin.from("submissions").update({ image_processing_status: "completed", image_processing_completed_at: new Date().toISOString() }).eq("id", submissionId);
  } catch (error) {
    await admin.from("submissions").update({ image_processing_status: "failed", image_processing_error: error instanceof Error ? error.message : "이미지 처리 실패", image_processing_completed_at: new Date().toISOString() }).eq("id", submissionId);
    throw error;
  }
}
