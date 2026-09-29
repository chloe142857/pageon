"use client";

import { useMemo, useState } from "react";

import { gradeBandFor, initialGradeForBand, lessonsFor } from "@/lib/lesson-contents";
import { questionTypes, type GenerationSource, type QuestionType, type WorksheetQuestionInput } from "@/lib/worksheet";

type Standard = { id: string; code: string; description: string; grade_band: string; area: string };
type QuestionDraft = WorksheetQuestionInput;

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  worksheetId?: string;
  importId?: string;
  standards: Standard[];
  initial?: {
    title: string;
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

const labels: Record<QuestionType, string> = {
  multiple_choice: "객관식",
  short_answer: "단답형",
  calculation: "계산형",
  constructed_response: "서술형",
};

function blankQuestion(standardId: string): QuestionDraft {
  return { type: "short_answer", questionText: "", answer: "", explanation: "", score: 1, achievementStandardId: standardId, page: 1, answerBBox: null };
}

function formatBBox(value: QuestionDraft["answerBBox"]) {
  return value ? `${value.x}, ${value.y}, ${value.width}, ${value.height}` : "";
}

export function WorksheetEditor({ action, worksheetId, importId, standards, initial }: Props) {
  const defaultStandardId = standards[0]?.id ?? "";
  const [questions, setQuestions] = useState<QuestionDraft[]>(initial?.questions?.length ? initial.questions : [blankQuestion(defaultStandardId)]);
  const [generationSource, setGenerationSource] = useState<GenerationSource>(initial?.generationSource ?? "manual");
  const [gradeBand, setGradeBand] = useState(initial?.gradeBand || "3~4학년");
  const [curriculumGrade, setCurriculumGrade] = useState(() => initialGradeForBand(initial?.gradeBand || "3~4학년"));
  const [semester, setSemester] = useState(initial?.semester || "1학기");
  const [selectedUnitNumber, setSelectedUnitNumber] = useState("");
  const [selectedLessonNumber, setSelectedLessonNumber] = useState("");
  const [unitName, setUnitName] = useState(initial?.unitName || "");
  const [lessonObjective, setLessonObjective] = useState(initial?.lessonObjective || "");
  const curriculumUnits = useMemo(() => lessonsFor(curriculumGrade, semester), [curriculumGrade, semester]);
  const selectedUnit = curriculumUnits.find((unit) => unit.unit_number === Number(selectedUnitNumber));
  const isMock = generationSource === "mock";
  const isPdfImport = generationSource === "pdf_import";
  const markEdited = () => setGenerationSource((current) => current === "mock" ? "manual" : current);

  function updateQuestion(index: number, field: keyof QuestionDraft, value: string | number) {
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, [field]: value } : question));
  }

  function fillMockQuestions() {
    const standardId = questions[0]?.achievementStandardId || defaultStandardId;
    setQuestions([
      { type: "multiple_choice", questionText: "12 ÷ 3의 답을 고르세요.\n① 3  ② 4  ③ 5  ④ 6", answer: "② 4", explanation: "12를 3개씩 똑같이 나누면 4입니다.", score: 1, achievementStandardId: standardId, page: 1, answerBBox: null },
      { type: "short_answer", questionText: "사탕 15개를 5명에게 똑같이 나누어 주면 한 명이 받는 사탕은 몇 개인가요?", answer: "3개", explanation: "15 ÷ 5 = 3", score: 2, achievementStandardId: standardId, page: 1, answerBBox: null },
      { type: "calculation", questionText: "48 ÷ 6을 계산하세요.", answer: "8", explanation: "6 × 8 = 48", score: 2, achievementStandardId: standardId, page: 1, answerBBox: null },
      { type: "constructed_response", questionText: "18 ÷ 3의 계산 방법을 그림, 식 또는 말로 설명하세요.", answer: "18을 3개씩 묶으면 6묶음이므로 18 ÷ 3 = 6", explanation: "3개씩 묶는 나눗셈의 의미를 설명합니다.", score: 3, achievementStandardId: standardId, page: 1, answerBBox: null },
    ]);
    setGenerationSource("mock");
  }

  function selectCurriculumGrade(grade: number) {
    setCurriculumGrade(grade);
    setGradeBand(gradeBandFor(grade));
    setSelectedUnitNumber("");
    setSelectedLessonNumber("");
  }

  function selectSemester(value: string) {
    setSemester(value);
    setSelectedUnitNumber("");
    setSelectedLessonNumber("");
  }

  function selectUnit(value: string) {
    setSelectedUnitNumber(value);
    setSelectedLessonNumber("");
    const unit = curriculumUnits.find((item) => item.unit_number === Number(value));
    if (unit) setUnitName(unit.unit_name);
  }

  function selectLesson(value: string) {
    setSelectedLessonNumber(value);
    const lesson = selectedUnit?.lessons.find((item) => item.lesson_number === Number(value));
    if (lesson) setLessonObjective(lesson.content);
  }

  return (
    <form action={action} className="form-grid">
      {worksheetId ? <input type="hidden" name="worksheetId" value={worksheetId} /> : null}
      {importId ? <input type="hidden" name="importId" value={importId} /> : null}
      <input type="hidden" name="generationSource" value={generationSource} />
      <div className="card form-grid">
        <div className="section-heading">
          <div><h2>활동지 기본 정보</h2><p className="muted">성취기준과 차시 목표를 먼저 정합니다.</p></div>
          <button type="button" className="secondary" onClick={fillMockQuestions}>개발용 목 문항 채우기</button>
        </div>
        {isMock ? <p className="mock-notice">현재 문항은 AI 결과가 아닌 개발용 목 데이터입니다. 저장 전 교사가 내용을 수정하세요.</p> : null}
        {isPdfImport ? <p className="mock-notice">기존 PDF에서 추천한 초안입니다. PDF 원본의 문항, 정답, 성취기준과 페이지를 교사가 확인·수정해야 합니다.</p> : null}
        <label>활동지 제목<input name="title" defaultValue={initial?.title} maxLength={120} required /></label>
        <div className="two-column">
          <label>학년군<select name="gradeBand" value={gradeBand} onChange={(event) => setGradeBand(event.target.value)}><option value="1~2학년">1~2학년</option><option value="3~4학년">3~4학년</option><option value="5~6학년">5~6학년</option></select></label>
          <label>학기<select name="semester" value={semester} onChange={(event) => selectSemester(event.target.value)}><option>1학기</option><option>2학기</option></select></label>
        </div>
        <fieldset className="curriculum-picker"><legend>진도표에서 차시 불러오기</legend><p className="muted">`lesson_contents.json`의 단원·차시를 선택하면 아래 단원과 차시 목표가 채워집니다. 저장 전에는 자유롭게 수정할 수 있습니다.</p><div className="three-column"><label>학년<select value={curriculumGrade} onChange={(event) => selectCurriculumGrade(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6].map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}</select></label><label>단원<select value={selectedUnitNumber} onChange={(event) => selectUnit(event.target.value)}><option value="">단원 선택</option>{curriculumUnits.map((unit) => <option key={unit.unit_number} value={unit.unit_number}>{unit.unit_number}. {unit.unit_name}</option>)}</select></label><label>차시<select value={selectedLessonNumber} onChange={(event) => selectLesson(event.target.value)} disabled={!selectedUnit}><option value="">차시 선택</option>{selectedUnit?.lessons.map((lesson) => <option key={lesson.lesson_number} value={lesson.lesson_number}>{lesson.lesson_number}차시 · {lesson.content}</option>)}</select></label></div></fieldset>
        <div className="two-column">
          <label>영역<input name="area" defaultValue={initial?.area} placeholder="예: 수와 연산" maxLength={60} /></label>
          <label>단원<input name="unitName" value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="예: 나눗셈" maxLength={120} /></label>
        </div>
        <label>차시 목표<textarea name="lessonObjective" value={lessonObjective} onChange={(event) => setLessonObjective(event.target.value)} maxLength={500} required /></label>
        <label>전체 페이지 수<input name="totalPages" type="number" min="1" max="30" defaultValue={initial?.totalPages ?? 1} required /><span className="muted">학생 촬영 화면에서 이 수만큼 페이지를 순서대로 제출합니다.</span></label>
        <label>활동지 성취기준 (여러 개 선택 가능)<select name="worksheetStandardIds" multiple defaultValue={initial?.worksheetStandardIds ?? (defaultStandardId ? [defaultStandardId] : [])} required size={7}>{standards.map((standard) => <option key={standard.id} value={standard.id}>[{standard.code}] {standard.description}</option>)}</select></label>
      </div>

      <div className="card form-grid">
        <div className="section-heading"><div><h2>문항</h2><p className="muted">문항별 성취기준, 정답, 해설, 배점을 저장합니다.</p></div><button type="button" className="secondary" onClick={() => { setQuestions((current) => [...current, blankQuestion(current[0]?.achievementStandardId || defaultStandardId)]); markEdited(); }}>문항 추가</button></div>
        <input type="hidden" name="questionCount" value={questions.length} />
        {questions.map((question, index) => (
          <fieldset className="question-card" key={index}>
            <legend>{index + 1}번 문항</legend>
            <div className="two-column">
              <label>유형<select name={`question-${index}-type`} value={question.type} onChange={(event) => { updateQuestion(index, "type", event.target.value as QuestionType); markEdited(); }}>{questionTypes.map((type) => <option key={type} value={type}>{labels[type]}</option>)}</select></label>
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
