"use client";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()}>인쇄 또는 PDF로 저장</button>;
}
