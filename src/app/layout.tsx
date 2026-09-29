import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Page On | 배움의 다음 페이지",
  description: "수학 활동지 준비부터 학생의 성장 기록까지, Page On에서 이어갑니다.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
