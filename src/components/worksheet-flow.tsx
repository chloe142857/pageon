import Link from "next/link";

const steps = ["수업 선택", "문항 검토", "인쇄 미리보기"];

type Props = {
  current: 1 | 2 | 3;
  links?: Partial<Record<1 | 2 | 3, string>>;
};

export function WorksheetFlow({ current, links = {} }: Props) {
  return (
    <nav className="worksheet-flow" aria-label="활동지 만들기 단계">
      {steps.map((label, index) => {
        const step = index + 1;
        const state = step < current ? "complete" : step === current ? "current" : "upcoming";
        const content = <><span>{step < current ? "✓" : String(step).padStart(2, "0")}</span><strong>{label}</strong></>;
        return links[step as 1 | 2 | 3] && step < current
          ? <Link className={`worksheet-flow-step ${state}`} key={label} href={links[step as 1 | 2 | 3]!}>{content}</Link>
          : <div className={`worksheet-flow-step ${state}`} key={label} aria-current={step === current ? "step" : undefined}>{content}</div>;
      })}
    </nav>
  );
}
