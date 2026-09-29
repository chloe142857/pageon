"use client";

/* eslint-disable @next/next/no-img-element -- local camera capture previews */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type CapturedPage = { blob: Blob; previewUrl: string };

type Props = {
  worksheetToken: string;
  totalPages: number;
};

export function StudentCapture({ worksheetToken, totalPages }: Props) {
  const router = useRouter();
  const initialPages = Array.from({ length: totalPages }, () => null) as Array<CapturedPage | null>;
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pagesRef = useRef<Array<CapturedPage | null>>(initialPages);
  const [pages, setPages] = useState<Array<CapturedPage | null>>(initialPages);
  const [currentPage, setCurrentPage] = useState(0);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [completedSubmissionId, setCompletedSubmissionId] = useState("");

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function startCamera(mode = facingMode) {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("이 브라우저에서는 카메라를 사용할 수 없습니다. 최신 모바일 브라우저에서 다시 시도하세요.");
      return;
    }

    setIsStarting(true);
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraStarted(true);
    } catch {
      setCameraError("카메라를 시작하지 못했습니다. 브라우저 카메라 권한과 다른 앱의 카메라 사용 여부를 확인하세요.");
    } finally {
      setIsStarting(false);
    }
  }

  useEffect(() => () => {
      stopCamera();
      pagesRef.current.forEach((page) => page && URL.revokeObjectURL(page.previewUrl));
    }, []);

  function replacePage(index: number, next: CapturedPage | null) {
    const previous = pagesRef.current[index];
    if (previous) URL.revokeObjectURL(previous.previewUrl);
    const nextPages = pagesRef.current.map((page, pageIndex) => pageIndex === index ? next : page);
    pagesRef.current = nextPages;
    setPages(nextPages);
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError("카메라 영상이 준비될 때까지 잠시 기다린 뒤 다시 촬영하세요.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCameraError("사진을 만들지 못했습니다. 다시 촬영하세요.");
        return;
      }
      replacePage(currentPage, { blob, previewUrl: URL.createObjectURL(blob) });
      setCameraError("");
      const nextMissing = pagesRef.current.findIndex((page) => !page);
      if (nextMissing >= 0) setCurrentPage(nextMissing);
    }, "image/jpeg", 0.92);
  }

  async function switchCamera() {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    await startCamera(nextMode);
  }

  async function submit() {
    if (pages.some((page) => !page)) {
      setSubmitError("모든 페이지를 촬영한 뒤 제출하세요.");
      return;
    }

    setSubmitError("");
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("worksheetToken", worksheetToken);
      pages.forEach((page, index) => {
        formData.append("pages", page!.blob, `page-${index + 1}.jpg`);
      });
      const response = await fetch("/api/student/submissions", { method: "POST", body: formData });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        router.push(`/student/sign-in?next=${encodeURIComponent(`/submit/${worksheetToken}`)}`);
        return;
      }
      if (!response.ok) throw new Error(result.error || "제출하지 못했습니다. 사진을 확인한 뒤 다시 시도하세요.");
      stopCamera();
      setCompletedSubmissionId(result.submissionId);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "제출하지 못했습니다. 다시 시도하세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const capturedCount = pages.filter(Boolean).length;

  if (completedSubmissionId) {
    return <div className="card"><h2>제출되었습니다</h2><p>촬영 원본 {totalPages}페이지를 안전하게 저장했습니다.</p><p className="muted">제출 번호: {completedSubmissionId}</p></div>;
  }

  return (
    <section className="card capture-card">
      <div className="section-heading"><div><h2>활동지 촬영</h2><p className="muted">{currentPage + 1} / {totalPages} 페이지 · {capturedCount}장 촬영됨</p></div><div className="capture-actions"><button type="button" className="secondary" onClick={() => void startCamera()} disabled={isStarting}>{cameraStarted ? "카메라 다시 시작" : "카메라 시작"}</button><button type="button" className="secondary" onClick={() => void switchCamera()} disabled={isStarting}>전면/후면 전환</button></div></div>
      <div className="camera-frame"><video ref={videoRef} autoPlay muted playsInline aria-label="카메라 미리보기" /></div>
      {cameraError ? <p className="danger" role="alert">{cameraError}</p> : null}
      <div className="capture-actions">
        {pages[currentPage] ? <button type="button" className="secondary" onClick={() => replacePage(currentPage, null)}>이 페이지 다시 촬영</button> : null}
        <button type="button" onClick={capture} disabled={isStarting || !cameraStarted}>{pages[currentPage] ? `${currentPage + 1}페이지 다시 찍기` : `${currentPage + 1}페이지 촬영`}</button>
      </div>
      <div className="page-thumbnails" aria-label="페이지 미리보기">
        {pages.map((page, index) => <button type="button" className={`thumbnail ${index === currentPage ? "selected" : ""}`} key={index} onClick={() => setCurrentPage(index)} aria-label={`${index + 1}페이지 ${page ? "재촬영하기" : "촬영하기"}`}><span>{index + 1}</span>{page ? <img src={page.previewUrl} alt={`${index + 1}페이지 촬영 미리보기`} /> : <span className="thumbnail-empty">미촬영</span>}</button>)}
      </div>
      {submitError ? <p className="danger" role="alert">{submitError}</p> : null}
      <button type="button" onClick={() => void submit()} disabled={capturedCount !== totalPages || isSubmitting}>{isSubmitting ? "원본 저장 중…" : `${totalPages}페이지 제출하기`}</button>
    </section>
  );
}
