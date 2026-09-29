import source from "../../lesson_contents.json" with { type: "json" };

export type Lesson = { lesson_number: number; content: string };
export type LessonUnit = { unit_number: number; unit_name: string; lessons: Lesson[] };
export type GradeSemester = { grade: number; semester: number; units: LessonUnit[] };

export const lessonContents = source as { subject: string; source_title: string; grades: GradeSemester[] };

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
