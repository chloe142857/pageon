import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { cropAnswerImage, processDocumentImage } from "../src/lib/image-processing.ts";

test("제출 이미지에서 보정 처리본과 정규화 답안 crop을 생성한다", async () => {
  const paper = await sharp({
    create: { width: 420, height: 600, channels: 3, background: "#ffffff" },
  }).composite([{ input: Buffer.from("<svg width=\"420\" height=\"600\"><rect x=\"35\" y=\"280\" width=\"350\" height=\"120\" fill=\"none\" stroke=\"black\" stroke-width=\"4\"/></svg>") }]).jpeg().toBuffer();
  const photo = await sharp({
    create: { width: 620, height: 820, channels: 3, background: "#263238" },
  }).composite([{ input: paper, left: 100, top: 110 }]).jpeg().toBuffer();

  const processed = await processDocumentImage(photo);
  const crop = await cropAnswerImage(processed.buffer, { x: 0.1, y: 0.45, width: 0.8, height: 0.25 });

  assert.ok(processed.buffer.length > 0);
  assert.ok(processed.transforms.some((transform) => transform.step === "document_detection"));
  assert.equal(crop.cropSource, "template_bbox");
  assert.ok(crop.buffer.length > 0);
  assert.ok(crop.buffer.length < processed.buffer.length);
});
