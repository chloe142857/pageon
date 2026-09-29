"use client";

import { useActionState, useMemo, useState } from "react";

import { gradeBandFor, lessonsFor, mathAreas, relatedStandards, suggestedArea } from "@/lib/lesson-contents";
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
    <form action={formAction} className="form-grid">
      <section className="card form-grid">
        <h2>수업 내용 선택</h2>
        <div className="two-column">
          <label>학년<select name="grade" value={grade} onChange={(event) => updateCurriculum(Number(event.target.value), semester)}>{[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}학년</option>)}</select></label>
          <label>학기<select name="semester" value={semester} onChange={(event) => updateCurriculum(grade, event.target.value)}><option>1학기</option><option>2학기</option></select></label>
        </div>
        <div className="two-column">
          <label>단원<select name="unitNumber" value={unitNumber} onChange={(event) => pickUnit(event.target.value)} required><option value="">단원 선택</option>{units.map((item) => <option value={item.unit_number} key={item.unit_number}>{item.unit_number}. {item.unit_name}</option>)}</select></label>
          <label>차시<select name="lessonNumber" value={lessonNumber} onChange={(event) => pickLesson(event.target.value)} required disabled={!unit}><option value="">차시 선택</option>{unit?.lessons.map((item) => <option value={item.lesson_number} key={item.lesson_number}>{item.lesson_number}차시 · {item.content}</option>)}</select></label>
        </div>
        {lesson ? <p className="notice">차시 내용: {lesson.content}</p> : null}
        <label>활동지 제목<input name="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required /></label>
        <div className="two-column">
          <label>관련 영역<select name="area" value={area} onChange={(event) => { const nextArea = event.target.value; setArea(nextArea); const best = relatedStandards(standards, grade, nextArea, unit?.unit_name ?? "", lesson?.content ?? "")[0]; setSelectedStandardIds(best ? [best.id] : []); }} required><option value="">영역 선택</option>{mathAreas.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>관련 성취기준<select name="standardIds" multiple value={selectedStandardIds} onChange={(event) => setSelectedStandardIds([...event.target.selectedOptions].map((option) => option.value))} required size={7} disabled={!area}>{candidates.map((item) => <option key={item.id} value={item.id}>[{item.code}] {item.description}</option>)}</select></label>
        </div>
        <p className="muted">{gradeBandFor(grade)} 성취기준 중 단원·차시와 가까운 순서로 표시합니다. 진도표에는 성취기준 코드가 없어 추천 결과를 교사가 확인해야 합니다. 여러 개를 선택할 수 있습니다.</p>
      </section>
      <section className="card form-grid">
        <h2>문항 수와 유형</h2>
        <label>전체 문항 수<select name="total" value={total} onChange={(event) => { const value = Number(event.target.value); setTotal(value); setCounts(evenCounts(value)); }}>{generationTotals.map((value) => <option key={value} value={value}>{value}문항</option>)}</select></label>
        <div className="three-column">
          {generationCategories.map((category) => <label key={category}>{categoryLabels[category]}<input type="number" name={category} min="0" max={total} value={counts[category]} onChange={(event) => setCounts((current) => ({ ...current, [category]: Number(event.target.value) }))} required /></label>)}
        </div>
        <p className={sum === total ? "notice" : "danger"}>현재 {sum}문항 / 선택한 {total}문항</p>
        <p className="muted">AI가 문항·정답·해설을 생성합니다. 문장제는 실생활 상황 문제로 만들고, 생성 후 모든 문항을 수정할 수 있습니다.</p>
      </section>
      {state.error ? <p className="danger" role="alert">{state.error}</p> : null}
      <button type="submit" disabled={pending || !lesson || !selectedStandardIds.length || sum !== total}>{pending ? "활동지 생성 중…" : "활동지 생성하기"}</button>
    </form>
  );
}
