import source from "../../lesson_contents.json" with { type: "json" };

export type Lesson = { lesson_number: number; content: string };
export type LessonUnit = { unit_number: number; unit_name: string; lessons: Lesson[] };
export type GradeSemester = { grade: number; semester: number; units: LessonUnit[] };

export const lessonContents = source as { subject: string; source_title: string; grades: GradeSemester[] };
export const mathAreas = ["수와 연산", "도형과 측정", "변화와 관계", "자료와 가능성"] as const;

type StandardCandidate = { id: string; code: string; description: string; grade_band: string; area: string };

export function suggestedArea(unitName: string, lessonContent = "") {
  const lesson = lessonContent.replace(/\s/g, "");
  const unit = unitName.replace(/\s/g, "");
  // 한 단원 안에 서로 다른 영역이 있는 경우에만 차시 내용을 먼저 본다.
  if (unit.includes("시계보기와규칙찾기")) return /규칙/.test(lesson) ? "변화와 관계" : "도형과 측정";
  // "각 자리", "곱셈표", "분수만큼의 길이", "삼각형을 분류"처럼 차시의
  // 일반 단어가 영역을 잘못 바꾸지 않도록 단원명을 우선한다.
  if (/규칙|대응|비례식|비례배분|비와비율/.test(unit)) return "변화와 관계";
  if (/도형|모양|삼각형|사각형|다각형|각도|각기둥|각뿔|원|길이|넓이|무게|들이|부피|겉넓이|시각|시간|대칭|입체|둘레|재기|비교하기/.test(unit)) return "도형과 측정";
  if (/자료|그래프|분류하기|표와|평균|가능성/.test(unit)) return "자료와 가능성";
  return "수와 연산";
}

function keywords(value: string) {
  return [...new Set((value.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).map((word) => word.replace(/(와|과|을|를|이|가|은|는|에|의|로)$/, "")))]
    .filter((word) => word.length >= 2)
    .filter((word) => !/^(알아보기|하기|구하기|나타내기|이해하기|여러가지|여러|가지)$/.test(word));
}

export function relatedStandards(standards: StandardCandidate[], grade: number, area: string, unitName: string, lessonContent: string) {
  const candidates = standards.filter((item) => item.grade_band === gradeBandFor(grade) && item.area === area);
  const terms = keywords(`${unitName} ${lessonContent}`);
  return candidates.map((item) => {
    const description = item.description.replace(/\s/g, "");
    const score = terms.reduce((sum, term) => sum + (description.includes(term.replace(/\s/g, "")) ? term.length : 0), 0);
    return { ...item, matchScore: score };
  }).sort((a, b) => b.matchScore - a.matchScore || a.code.localeCompare(b.code, "ko"));
}

export function gradeBandFor(grade: number) {
  if (grade <= 2) return "1~2학년";
  if (grade <= 4) return "3~4학년";
  return "5~6학년";
}

export function initialGradeForBand(gradeBand: string) {
  if (gradeBand === "1~2학년") return 1;
  if (gradeBand === "5~6학년") return 5;
  return 3;
}

export function lessonsFor(grade: number, semester: string) {
  const semesterNumber = semester === "2학기" ? 2 : 1;
  return lessonContents.grades.find((item) => item.grade === grade && item.semester === semesterNumber)?.units ?? [];
}
