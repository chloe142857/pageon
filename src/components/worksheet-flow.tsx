const steps = ["수업 선택", "문항 확인", "활동지 확인", "인쇄 미리보기"];

type Props = { current: 1 | 2 | 3 | 4 };

export function WorksheetFlow({ current }: Props) {
  return (
    <nav className="worksheet-flow" aria-label="활동지 만들기 단계">
      {steps.map((label, index) => {
        const step = index + 1;
        const state = step < current ? "complete" : step === current ? "current" : "upcoming";
        return <div className={`worksheet-flow-step ${state}`} key={label} aria-current={step === current ? "step" : undefined}>
          <span>{step < current ? "✓" : String(step).padStart(2, "0")}</span>
          <strong>{label}</strong>
        </div>;
      })}
    </nav>
  );
}
