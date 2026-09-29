"use client";

import { useMemo, useState } from "react";

import { gradeBandFor, initialGradeForBand, lessonsFor, mathAreas, relatedStandards, suggestedArea } from "@/lib/lesson-contents";
import { questionTypes, type GenerationSource, type QuestionCategory, type QuestionType, type WorksheetQuestionInput } from "@/lib/worksheet";

type Standard = { id: string; code: string; description: string; grade_band: string; area: string };
type QuestionDraft = WorksheetQuestionInput;

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  worksheetId?: string;
  importId?: string;
  standards: Standard[];
  initial?: {
    title: string;
    curriculumGrade?: number;
    gradeBand: string;
    semester: string;
    area: string;
    unitName: string;
    lessonObjective: string;
    totalPages: number;
    worksheetStandardIds: string[];
    questions: QuestionDraft[];
    generationSource?: GenerationSource;
  };
};

const labels: Record<QuestionCategory, string> = {
  multiple_choice: "객관식",
  short_answer: "단답형",
  calculation: "단순 연산",
  constructed_response: "서술형",
  word_problem: "문장제 문제",
};

function blankQuestion(standardId: string): QuestionDraft {
  return { type: "short_answer", questionText: "", answer: "", explanation: "", score: 1, achievementStandardId: standardId, page: 1, answerBBox: null };
}

function formatBBox(value: QuestionDraft["answerBBox"]) {
  return value ? `${value.x}, ${value.y}, ${value.width}, ${value.height}` : "";
}

export function WorksheetEditor({ action, worksheetId, importId, standards, initial }: Props) {
  const defaultStandardId = standards[0]?.id ?? "";
  const initialGrade = initial?.curriculumGrade ?? initialGradeForBand(initial?.gradeBand || "3~4학년");
  const initialUnits = lessonsFor(initialGrade, initial?.semester || "1학기");
  const initialUnit = initialUnits.find((item) => item.unit_name === initial?.unitName);
  const initialLesson = initialUnit?.lessons.find((item) => item.content === initial?.lessonObjective);
  const [questions, setQuestions] = useState<QuestionDraft[]>(initial?.questions?.length ? initial.questions : [blankQuestion(defaultStandardId)]);
  const [generationSource, setGenerationSource] = useState<GenerationSource>(initial?.generationSource ?? "manual");
  const [gradeBand, setGradeBand] = useState(initial?.gradeBand || "3~4학년");
  const [curriculumGrade, setCurriculumGrade] = useState(initialGrade);
  const [semester, setSemester] = useState(initial?.semester || "1학기");
  const [selectedUnitNumber, setSelectedUnitNumber] = useState(initialUnit ? String(initialUnit.unit_number) : "");
  const [selectedLessonNumber, setSelectedLessonNumber] = useState(initialLesson ? String(initialLesson.lesson_number) : "");
  const [unitName, setUnitName] = useState(initial?.unitName || "");
  const [lessonObjective, setLessonObjective] = useState(initial?.lessonObjective || "");
  const [area, setArea] = useState(initial?.area || "");
  const [selectedStandardIds, setSelectedStandardIds] = useState(initial?.worksheetStandardIds ?? (defaultStandardId ? [defaultStandardId] : []));
  const curriculumUnits = useMemo(() => lessonsFor(curriculumGrade, semester), [curriculumGrade, semester]);
  const selectedUnit = curriculumUnits.find((unit) => unit.unit_number === Number(selectedUnitNumber));
  const selectedLesson = selectedUnit?.lessons.find((item) => item.lesson_number === Number(selectedLessonNumber));
  const related = useMemo(() => relatedStandards(standards, curriculumGrade, area, unitName, lessonObjective), [standards, curriculumGrade, area, unitName, lessonObjective]);
  const isMock = generationSource === "mock";
  const isPdfImport = generationSource === "pdf_import";
  const markEdited = () => setGenerationSource((current) => current === "mock" ? "manual" : current);

  function updateQuestion(index: number, field: keyof QuestionDraft, value: string | number) {
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, [field]: value } : question));
  }

  function selectCurriculumGrade(grade: number) {
    setCurriculumGrade(grade);
    setGradeBand(gradeBandFor(grade));
    setSelectedUnitNumber("");
    setSelectedLessonNumber("");
    setArea("");
    setSelectedStandardIds([]);
  }

  function selectSemester(value: string) {
    setSemester(value);
    setSelectedUnitNumber("");
    setSelectedLessonNumber("");
    setArea("");
    setSelectedStandardIds([]);
  }

  function selectUnit(value: string) {
    setSelectedUnitNumber(value);
    setSelectedLessonNumber("");
    const unit = curriculumUnits.find((item) => item.unit_number === Number(value));
    if (unit) {
      setUnitName(unit.unit_name);
      setArea(suggestedArea(unit.unit_name));
      setSelectedStandardIds([]);
    }
  }

  function selectLesson(value: string) {
    setSelectedLessonNumber(value);
    const lesson = selectedUnit?.lessons.find((item) => item.lesson_number === Number(value));
    if (lesson && selectedUnit) {
      setLessonObjective(lesson.content);
      const nextArea = suggestedArea(selectedUnit.unit_name, lesson.content);
      setArea(nextArea);
      const best = relatedStandards(standards, curriculumGrade, nextArea, selectedUnit.unit_name, lesson.content)[0];
      setSelectedStandardIds(best ? [best.id] : []);
      if (best) setQuestions((current) => current.map((question) => ({ ...question, achievementStandardId: best.id })));
    }
  }

  return (
    <form action={action} className="form-grid">
      {worksheetId ? <input type="hidden" name="worksheetId" value={worksheetId} /> : null}
      {importId ? <input type="hidden" name="importId" value={importId} /> : null}
      <input type="hidden" name="generationSource" value={generationSource} />
      <div className="card form-grid">
        <div className="section-heading"><div><h2>활동지 기본 정보</h2><p className="muted">성취기준과 차시 목표를 먼저 정합니다.</p></div></div>
        {isMock ? <p className="mock-notice">현재 문항은 AI 결과가 아닌 개발용 목 데이터입니다. 저장 전 교사가 내용을 수정하세요.</p> : null}
        {isPdfImport ? <p className="mock-notice">기존 PDF에서 추천한 초안입니다. PDF 원본의 문항, 정답, 성취기준과 페이지를 교사가 확인·수정해야 합니다.</p> : null}
        <label>활동지 제목<input name="title" defaultValue={initial?.title} maxLength={120} required /></label>
        <input type="hidden" name="gradeBand" value={gradeBand} />
        <div className="two-column">
          <label>학년<select name="curriculumGrade" value={curriculumGrade} onChange={(event) => selectCurriculumGrade(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}</select></label>
          <label>학기<select name="semester" value={semester} onChange={(event) => selectSemester(event.target.value)}><option>1학기</option><option>2학기</option></select></label>
        </div>
        <div className="two-column"><label>단원<select value={selectedUnitNumber} onChange={(event) => selectUnit(event.target.value)}><option value="">단원 선택</option>{curriculumUnits.map((unit) => <option key={unit.unit_number} value={unit.unit_number}>{unit.unit_number}. {unit.unit_name}</option>)}</select></label><label>차시<select value={selectedLessonNumber} onChange={(event) => selectLesson(event.target.value)} disabled={!selectedUnit}><option value="">차시 선택</option>{selectedUnit?.lessons.map((lesson) => <option key={lesson.lesson_number} value={lesson.lesson_number}>{lesson.lesson_number}차시 · {lesson.content}</option>)}</select></label></div>
        {selectedLesson ? <p className="muted">선택한 차시: {selectedLesson.content}</p> : null}
        <div className="two-column">
          <label>영역<select name="area" value={area} onChange={(event) => { const nextArea = event.target.value; setArea(nextArea); const best = relatedStandards(standards, curriculumGrade, nextArea, unitName, lessonObjective)[0]; setSelectedStandardIds(best ? [best.id] : []); if (best) setQuestions((current) => current.map((question) => ({ ...question, achievementStandardId: best.id }))); }}><option value="">영역 선택</option>{mathAreas.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>단원<input name="unitName" value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="예: 나눗셈" maxLength={120} /></label>
        </div>
        <label>차시 목표<textarea name="lessonObjective" value={lessonObjective} onChange={(event) => setLessonObjective(event.target.value)} maxLength={500} required /></label>
        <label>전체 페이지 수<input name="totalPages" type="number" min="1" max="30" defaultValue={initial?.totalPages ?? 1} required /><span className="muted">학생 촬영 화면에서 이 수만큼 페이지를 순서대로 제출합니다.</span></label>
        <label>관련 성취기준 (여러 개 선택 가능)<select name="worksheetStandardIds" multiple value={selectedStandardIds} onChange={(event) => setSelectedStandardIds([...event.target.selectedOptions].map((option) => option.value))} required size={7}>{related.map((standard) => <option key={standard.id} value={standard.id}>[{standard.code}] {standard.description}</option>)}</select></label>
      </div>

      <div className="card form-grid">
        <div className="section-heading"><div><h2>문항</h2><p className="muted">문항별 성취기준, 정답, 해설, 배점을 저장합니다.</p></div><button type="button" className="secondary" onClick={() => { setQuestions((current) => [...current, blankQuestion(current[0]?.achievementStandardId || defaultStandardId)]); markEdited(); }}>문항 추가</button></div>
        <input type="hidden" name="questionCount" value={questions.length} />
        {questions.map((question, index) => (
          <fieldset className="question-card" key={index}>
            <legend>{index + 1}번 문항</legend>
            <div className="two-column">
              <label>유형<select name={`question-${index}-category`} value={question.category ?? question.type} onChange={(event) => { const category = event.target.value as QuestionCategory; setQuestions((current) => current.map((item, questionIndex) => questionIndex === index ? { ...item, category, type: category === "word_problem" ? "short_answer" : category as QuestionType } : item)); markEdited(); }}>{[...questionTypes, "word_problem" as const].map((type) => <option key={type} value={type}>{labels[type]}</option>)}</select><input type="hidden" name={`question-${index}-type`} value={question.type} /></label>
              <label>배점<input name={`question-${index}-score`} type="number" min="0" max="100" step="0.5" value={question.score} onChange={(event) => { updateQuestion(index, "score", Number(event.target.value)); markEdited(); }} required /></label>
            </div>
            <label>문항 내용<textarea name={`question-${index}-text`} value={question.questionText} onChange={(event) => { updateQuestion(index, "questionText", event.target.value); markEdited(); }} required /></label>
            <div className="two-column"><label>정답<input name={`question-${index}-answer`} value={question.answer} onChange={(event) => { updateQuestion(index, "answer", event.target.value); markEdited(); }} required /></label><label>페이지<input name={`question-${index}-page`} type="number" min="1" max="100" value={question.page} onChange={(event) => { updateQuestion(index, "page", Number(event.target.value)); markEdited(); }} required /></label></div>
            <label>해설 (선택)<textarea name={`question-${index}-explanation`} value={question.explanation} onChange={(event) => { updateQuestion(index, "explanation", event.target.value); markEdited(); }} /></label>
            <label>문항 성취기준<select name={`question-${index}-standard`} value={question.achievementStandardId} onChange={(event) => { updateQuestion(index, "achievementStandardId", event.target.value); markEdited(); }} required>{standards.map((standard) => <option key={standard.id} value={standard.id}>[{standard.code}] {standard.description}</option>)}</select></label>
            <label>답안 영역 좌표 (선택)<input name={`question-${index}-answer-bbox`} defaultValue={formatBBox(question.answerBBox)} placeholder="x, y, 너비, 높이 (예: 0.1, 0.5, 0.8, 0.2)" /><span className="muted">AI/템플릿 활동지는 0~1 비율 좌표를 입력하면 해당 영역만 인식합니다. 비어 있으면 전체 페이지를 보존합니다.</span></label>
            {questions.length > 1 ? <button type="button" className="secondary" onClick={() => { setQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index)); markEdited(); }}>이 문항 삭제</button> : null}
          </fieldset>
        ))}
      </div>
      <button type="submit">활동지 저장</button>
    </form>
  );
}
