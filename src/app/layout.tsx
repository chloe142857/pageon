import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Page On 수학 활동지",
  description: "초등 수학 종이 활동지 관리",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
