"use client";

import { useActionState, useMemo, useState } from "react";

import { lessonsFor, mathAreas, relatedStandards, suggestedArea } from "@/lib/lesson-contents";
import { generationCategories, generationTotals, type GenerationCategory } from "@/lib/worksheet-generation";

type Standard = { id: string; code: string; description: string; grade_band: string; area: string };
type Props = { action: (previous: { error: string }, formData: FormData) => Promise<{ error: string }>; standards: Standard[] };

const categoryLabels: Record<GenerationCategory, string> = {
  short_answer: "단답형",
  multiple_choice: "객관식",
  constructed_response: "서술형",
  calculation: "단순 연산",
  word_problem: "문장제 문제",
};

function evenCounts(total: number) {
  return Object.fromEntries(generationCategories.map((category, index) => [category, Math.floor(total / 5) + (index < total % 5 ? 1 : 0)])) as Record<GenerationCategory, number>;
}

export function WorksheetGenerator({ action, standards }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  const [grade, setGrade] = useState(3);
  const [semester, setSemester] = useState("1학기");
  const [unitNumber, setUnitNumber] = useState("");
  const [lessonNumber, setLessonNumber] = useState("");
  const [area, setArea] = useState<string>("");
  const [selectedStandardIds, setSelectedStandardIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState<number>(10);
  const [counts, setCounts] = useState(evenCounts(10));
  const units = useMemo(() => lessonsFor(grade, semester), [grade, semester]);
  const unit = units.find((item) => item.unit_number === Number(unitNumber));
  const lesson = unit?.lessons.find((item) => item.lesson_number === Number(lessonNumber));
  const candidates = useMemo(() => relatedStandards(standards, grade, area, unit?.unit_name ?? "", lesson?.content ?? ""), [standards, grade, area, unit, lesson]);
  const sum = generationCategories.reduce((value, category) => value + counts[category], 0);

  function updateCurriculum(nextGrade: number, nextSemester: string) {
    setGrade(nextGrade);
    setSemester(nextSemester);
    setUnitNumber("");
    setLessonNumber("");
    setArea("");
    setSelectedStandardIds([]);
  }

  function pickUnit(value: string) {
    setUnitNumber(value);
    setLessonNumber("");
    const chosen = units.find((item) => item.unit_number === Number(value));
    const nextArea = chosen ? suggestedArea(chosen.unit_name) : "";
    setArea(nextArea);
    setSelectedStandardIds([]);
    if (chosen) setTitle(`${grade}학년 ${semester} ${chosen.unit_name}`);
  }

  function pickLesson(value: string) {
    setLessonNumber(value);
    const chosen = unit?.lessons.find((item) => item.lesson_number === Number(value));
    if (!unit || !chosen) return;
    const nextArea = suggestedArea(unit.unit_name, chosen.content);
    setArea(nextArea);
    const best = relatedStandards(standards, grade, nextArea, unit.unit_name, chosen.content)[0];
    setSelectedStandardIds(best ? [best.id] : []);
    setTitle(`${grade}학년 ${semester} ${unit.unit_name} ${chosen.lesson_number}차시`);
  }

  return (
    <form action={formAction} className="form-grid generator-form">
      <section className="card form-grid">
        <div className="step-heading"><span>01</span><div><h2>어떤 수업에 사용할까요?</h2><p className="muted">학년부터 차시까지 차례로 선택해 주세요.</p></div></div>
        <div className="two-column">
          <label>학년<select name="grade" value={grade} onChange={(event) => updateCurriculum(Number(event.target.value), semester)}>{[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}학년</option>)}</select></label>
          <label>학기<select name="semester" value={semester} onChange={(event) => updateCurriculum(grade, event.target.value)}><option>1학기</option><option>2학기</option></select></label>
        </div>
        <div className="two-column">
          <label>단원<select name="unitNumber" value={unitNumber} onChange={(event) => pickUnit(event.target.value)} required><option value="">단원 선택</option>{units.map((item) => <option value={item.unit_number} key={item.unit_number}>{item.unit_number}. {item.unit_name}</option>)}</select></label>
          <label>차시<select name="lessonNumber" value={lessonNumber} onChange={(event) => pickLesson(event.target.value)} required disabled={!unit}><option value="">차시 선택</option>{unit?.lessons.map((item) => <option value={item.lesson_number} key={item.lesson_number}>{item.lesson_number}차시 · {item.content}</option>)}</select></label>
        </div>
        {lesson ? <p className="notice">이번 차시: {lesson.content}</p> : null}
        <label>활동지 제목<input name="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></label>
        <div className="two-column">
          <label>관련 영역<select name="area" value={area} onChange={(event) => { const nextArea = event.target.value; setArea(nextArea); const best = relatedStandards(standards, grade, nextArea, unit?.unit_name ?? "", lesson?.content ?? "")[0]; setSelectedStandardIds(best ? [best.id] : []); }} required><option value="">영역 선택</option>{mathAreas.map((value) => <option key={value}>{value}</option>)}</select></label>
          <div className="standards-field"><span className="field-label">관련 성취기준</span><div className="standards-list">{candidates.length ? candidates.map((item) => <label className="standard-option" key={item.id}><input type="checkbox" name="standardIds" value={item.id} checked={selectedStandardIds.includes(item.id)} onChange={(event) => setSelectedStandardIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span><strong>[{item.code}]</strong> {item.description}</span></label>) : <p className="muted">수업 내용을 선택하면 관련 기준이 나타납니다.</p>}</div></div>
        </div>
        <p className="muted">수업과 가까운 기준을 먼저 보여드려요. 내용을 확인하고 필요한 기준을 선택해 주세요.</p>
      </section>
      <section className="card form-grid">
        <div className="step-heading"><span>02</span><div><h2>문항을 어떻게 구성할까요?</h2><p className="muted">전체 개수와 유형별 개수를 정해 주세요.</p></div></div>
        <label>전체 문항 수<select name="total" value={total} onChange={(event) => { const value = Number(event.target.value); setTotal(value); setCounts(evenCounts(value)); }}>{generationTotals.map((value) => <option key={value} value={value}>{value}문항</option>)}</select></label>
        <div className="three-column">
          {generationCategories.map((category) => <label key={category}>{categoryLabels[category]}<input type="number" name={category} min="0" max={total} value={counts[category]} onChange={(event) => setCounts((current) => ({ ...current, [category]: Number(event.target.value) }))} required /></label>)}
        </div>
        <p className={sum === total ? "notice" : "danger"}>선택한 문항 {sum}개 · 전체 {total}개{sum === total ? " — 준비됐어요" : " — 개수를 맞춰 주세요"}</p>
        <p className="muted">활동지를 만든 뒤 문항과 정답을 검토하고 자유롭게 수정할 수 있어요.</p>
      </section>
      {state.error ? <p className="danger" role="alert">{state.error}</p> : null}
      <button type="submit" className="generator-submit" disabled={pending || !lesson || !selectedStandardIds.length || sum !== total}>{pending ? "활동지를 만들고 있어요…" : "활동지 만들기 →"}</button>
    </form>
  );
}
