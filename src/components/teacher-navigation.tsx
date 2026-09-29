"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { teacherSignOut } from "@/app/teacher/sign-in/actions";

import { BrandLogo } from "./brand-logo";

const links = [
  { href: "/teacher", label: "홈" },
  { href: "/teacher/classrooms", label: "학급·학생" },
  { href: "/teacher/worksheets", label: "활동지" },
  { href: "/teacher/review", label: "답안 검토" },
  { href: "/teacher/analytics", label: "학습 분석" },
];

export function TeacherNavigation() {
  const pathname = usePathname();
  const isSignIn = pathname === "/teacher/sign-in";

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand-link" href="/" aria-label="Page On 첫 화면"><BrandLogo compact /><span className="brand-divider" /><span className="brand-caption">교사용</span></Link>
        {isSignIn ? <Link className="header-quiet-link" href="/student/sign-in">학생으로 시작하기 <span aria-hidden>↗</span></Link> : <>
          <nav className="nav-links" aria-label="교사 메뉴">
            {links.map((link) => {
              const active = link.href === "/teacher" ? pathname === link.href : pathname.startsWith(link.href);
              return <Link key={link.href} href={link.href} className={active ? "nav-link active" : "nav-link"} aria-current={active ? "page" : undefined}>{link.label}</Link>;
            })}
          </nav>
          <form action={teacherSignOut} className="header-signout"><button type="submit" className="text-button">로그아웃</button></form>
        </>}
      </div>
    </header>
  );
}
