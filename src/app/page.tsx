import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";

export default function HomePage() {
  return (
    <main className="landing-page">
      <header className="landing-header"><Link href="/" aria-label="Page On 첫 화면"><BrandLogo /></Link><span>종이에서 시작하는 배움의 기록</span></header>
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="eyebrow"><span className="eyebrow-dot" /> 수학 수업의 새로운 흐름</span>
          <h1>한 장의 활동지가<br /><span>성장의 기록</span>이 되도록.</h1>
          <p>수업에 맞는 활동지를 만들고, 학생의 풀이를 모아 성취기준별 변화를 살펴보세요. 종이 활동의 익숙함은 그대로, 확인과 정리는 더 가볍게.</p>
          <div className="landing-actions"><Link className="button-link" href="/teacher/sign-in">선생님으로 시작하기 <span aria-hidden>↗</span></Link><Link className="button-link secondary-link" href="/student/sign-in">학생으로 참여하기 <span aria-hidden>→</span></Link></div>
          <div className="landing-proof"><span>01&nbsp; 수업에 맞게 만들고</span><span>02&nbsp; 사진으로 제출하고</span><span>03&nbsp; 성장으로 이어집니다</span></div>
        </div>
        <div className="landing-art" aria-hidden="true">
          <div className="art-orbit art-orbit-one" /><div className="art-orbit art-orbit-two" />
          <div className="art-note art-note-top"><span className="art-note-mark">✓</span><span>오늘의 수업 준비<br /><strong>완료되었어요</strong></span></div>
          <div className="art-paper">
            <div className="art-paper-top"><span>PAGE ON · MATH</span><span>03 / 06</span></div>
            <div className="art-paper-title">나눗셈을 알아보아요</div>
            <div className="art-paper-rule" />
            <div className="art-problem"><span className="art-problem-num">01</span><span>12개의 블록을 3명에게<br />똑같이 나누어 주세요.</span></div>
            <div className="art-box-row"><i /><i /><i /><i /></div>
            <div className="art-answer"><span>나의 답</span><div /></div>
            <div className="art-problem"><span className="art-problem-num">02</span><span>18 ÷ 3 = <b>?</b></span></div>
            <div className="art-answer"><span>나의 답</span><div /></div>
            <div className="art-paper-bottom"><span>배움이 이어지는 곳</span><span className="art-qr">▦</span></div>
          </div>
          <div className="art-note art-note-bottom"><span className="art-mini-chart"><i /><i /><i /><i /></span><span>우리 반의 성장<br /><strong>한눈에 살펴보기</strong></span></div>
        </div>
      </section>
      <section className="landing-steps" aria-label="이용 방법"><div><span className="step-number">01</span><h2>수업을 고르면</h2><p>학년과 차시에 맞는 활동지를 준비합니다.</p></div><div><span className="step-number">02</span><h2>종이에 풀고 찍으면</h2><p>학생은 QR로 접속해 사진을 제출합니다.</p></div><div><span className="step-number">03</span><h2>배움이 보입니다</h2><p>확인이 필요한 답안과 성장 기록을 살펴봅니다.</p></div></section>
      <footer className="landing-footer"><span>Page On</span><span>배움의 다음 페이지를 열다.</span></footer>
    </main>
  );
}
