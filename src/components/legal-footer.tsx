"use client";

import { useState } from "react";

type LegalType = "privacy" | "terms";

const content: Record<LegalType, { title: string; paragraphs: string[] }> = {
  privacy: {
    title: "개인정보처리방침",
    paragraphs: [
      "Page On은 수업 운영과 학생 학습 기록 제공에 필요한 최소한의 정보만 처리합니다. 교사는 이메일과 학급 정보를, 학생은 학급 안에서 구분되는 이름·번호와 비밀번호를 사용합니다.",
      "학생이 제출한 활동지 사진과 채점·검토 결과는 수업 기록 제공과 성취기준별 학습 분석을 위해 보관합니다. 학생 사진과 계정 정보는 공개하지 않으며, 교사가 관리하는 학급 범위에서만 접근할 수 있습니다.",
      "교사는 학급 관리 화면에서 학생 정보를 수정하거나 삭제할 수 있습니다. 개인정보 관련 문의는 책임자에게 연락해 주세요.",
    ],
  },
  terms: {
    title: "이용약관",
    paragraphs: [
      "Page On은 초등 수학 활동지의 제작, 제출, 채점 보조 및 학습 기록 확인을 위한 교육용 웹 서비스입니다.",
      "교사는 학생 정보와 활동지 내용을 정확하게 관리해야 하며, 학생의 개인정보를 활동 목적 외로 사용하지 않아야 합니다. 자동 채점 결과는 교사의 검토를 보조하는 정보이며 최종 교육적 판단은 교사에게 있습니다.",
      "서비스 개선, 보안 유지 또는 관계 법령의 변경에 따라 이 약관과 방침은 변경될 수 있습니다.",
    ],
  },
};

export function LegalFooter() {
  const [open, setOpen] = useState<LegalType | null>(null);
  const document = open ? content[open] : null;

  return <>
    <footer className="service-footer"><div><strong>Page On</strong><span>책임자 서울원광초등학교 교사 나혜진</span></div><div><button type="button" className="text-button" onClick={() => setOpen("privacy")}>개인정보처리방침</button><button type="button" className="text-button" onClick={() => setOpen("terms")}>이용약관</button></div></footer>
    {document ? <div className="legal-backdrop" role="presentation" onMouseDown={() => setOpen(null)}><section className="legal-modal" role="dialog" aria-modal="true" aria-labelledby="legal-title" onMouseDown={(event) => event.stopPropagation()}><div className="legal-modal-heading"><h2 id="legal-title">{document.title}</h2><button type="button" className="modal-close" aria-label="닫기" onClick={() => setOpen(null)}>×</button></div>{document.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}<button type="button" onClick={() => setOpen(null)}>확인</button></section></div> : null}
  </>;
}
