import { NextResponse } from "next/server";

const template = "학생번호,학생이름,비밀번호\n1,김하늘,1234\n2,이바다,1234\n";

export function GET() {
  return new NextResponse(`\uFEFF${template}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=pageon-student-list-template.csv",
      "Cache-Control": "no-store",
    },
  });
}
