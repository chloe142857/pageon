import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import { LegalFooter } from "@/components/legal-footer";

export default function HomePage() {
  return (
    <main className="landing-page">
      <header className="landing-header"><Link href="/" aria-label="Page On 첫 화면"><BrandLogo /></Link><span>배움의 다음 페이지를 열다</span></header>
      <section className="landing-hero">
        <div className="landing-copy">
          <h1>한 장의 활동지가<br /><span>성장의 기록</span>이 되도록.</h1>
          <p>수업에 맞는 활동지를 만들고 결과를 모아 학생의 성장을 살펴보세요.<br />활동지 제작부터 채점, 분석까지 한 번에!</p>
          <div className="landing-actions"><Link className="button-link" href="/teacher/sign-in">선생님으로 시작하기 <span aria-hidden>↗</span></Link><Link className="button-link secondary-link" href="/student/sign-in">학생으로 참여하기 <span aria-hidden>→</span></Link></div>
        </div>
      </section>
      <section className="landing-steps" aria-label="이용 방법"><div><span className="step-number">01</span><h2>수업에 맞게 만들고</h2></div><div><span className="step-number">02</span><h2>사진으로 제출하고</h2></div><div><span className="step-number">03</span><h2>성장으로 이어집니다</h2></div></section>
      <LegalFooter />
    </main>
  );
}
