import type { GradingResult } from "./grading";

export type AnalyticsStudent = { id: string; classroomId: string; displayName: string; studentNumber: number; active: boolean };
export type AnalyticsWorksheet = { id: string; title: string; gradeBand: string; semester: string; area: string; unitName: string };
export type AnalyticsQuestion = { id: string; worksheetId: string; questionNumber: number; questionText: string; score: number; achievementStandardId: string };
export type AnalyticsSubmission = { id: string; worksheetId: string; studentId: string; submittedAt: string | null };
export type AnalyticsAnswer = { submissionId: string; questionId: string; result: GradingResult; scoreAwarded: number; source: "teacher" | "auto" };
export type AnalyticsStandard = { id: string; code: string; description: string };

export type AnalyticsInput = {
  students: AnalyticsStudent[];
  worksheets: AnalyticsWorksheet[];
  questions: AnalyticsQuestion[];
  submissions: AnalyticsSubmission[];
  answers: AnalyticsAnswer[];
  standards: AnalyticsStandard[];
  classroomId?: string;
  worksheetId?: string;
};

export type PerformanceLevel = "잘함" | "보통" | "노력요함";

function percentage(value: number, total: number) {
  return total > 0 ? Number(((value / total) * 100).toFixed(1)) : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return Number((sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2).toFixed(1));
}

export function performanceLevel(scoreRate: number | null): PerformanceLevel | null {
  if (scoreRate === null) return null;
  if (scoreRate >= 80) return "잘함";
  if (scoreRate >= 60) return "보통";
  return "노력요함";
}

function trendLabel(history: number[]) {
  if (history.length < 2) return "기록 축적 중";
  const recent = history.slice(-3);
  const previous = history.slice(-6, -3);
  if (!previous.length) return "기록 축적 중";
  const recentMean = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const previousMean = previous.reduce((sum, value) => sum + value, 0) / previous.length;
  if (recentMean - previousMean >= 5) return "상승";
  if (previousMean - recentMean >= 5) return "하락";
  return "유지";
}

function latestSubmissions(submissions: AnalyticsSubmission[]) {
  const latest = new Map<string, AnalyticsSubmission>();
  for (const submission of submissions) {
    const key = `${submission.worksheetId}:${submission.studentId}`;
    const previous = latest.get(key);
    const currentTime = submission.submittedAt ? new Date(submission.submittedAt).getTime() : 0;
    const previousTime = previous?.submittedAt ? new Date(previous.submittedAt).getTime() : -1;
    if (!previous || currentTime >= previousTime) latest.set(key, submission);
  }
  return [...latest.values()];
}

export function calculateAnalytics(input: AnalyticsInput) {
  const questionsById = new Map(input.questions.map((question) => [question.id, question]));
  const standardsById = new Map(input.standards.map((standard) => [standard.id, standard]));
  const latest = latestSubmissions(input.submissions);
  const latestIds = new Set(latest.map((submission) => submission.id));
  const answers = input.answers.filter((answer) => latestIds.has(answer.submissionId) && questionsById.has(answer.questionId));
  const answersBySubmission = new Map<string, AnalyticsAnswer[]>();
  for (const answer of answers) {
    answersBySubmission.set(answer.submissionId, [...(answersBySubmission.get(answer.submissionId) ?? []), answer]);
  }

  const activitySummaries = input.worksheets.map((worksheet) => {
    const worksheetQuestions = input.questions.filter((question) => question.worksheetId === worksheet.id);
    const worksheetSubmissions = latest.filter((submission) => submission.worksheetId === worksheet.id);
    const scores = worksheetSubmissions.flatMap((submission) => {
      const submissionAnswers = answersBySubmission.get(submission.id) ?? [];
      const resolvedMaximum = submissionAnswers.reduce((sum, answer) => sum + (questionsById.get(answer.questionId)?.score ?? 0), 0);
      const awarded = submissionAnswers.reduce((sum, answer) => sum + answer.scoreAwarded, 0);
      const scoreRate = percentage(awarded, resolvedMaximum);
      return scoreRate === null ? [] : [scoreRate];
    });
    const submittedStudentIds = new Set(worksheetSubmissions.map((submission) => submission.studentId));
    const expectedStudents = input.classroomId
      ? input.students.filter((student) => student.classroomId === input.classroomId && student.active)
      : [];
    const missingStudents = input.classroomId && input.worksheetId === worksheet.id
      ? expectedStudents.filter((student) => !submittedStudentIds.has(student.id))
      : null;
    const distribution = [
      { label: "0~59", count: scores.filter((score) => score < 60).length },
      { label: "60~79", count: scores.filter((score) => score >= 60 && score < 80).length },
      { label: "80~100", count: scores.filter((score) => score >= 80).length },
    ];
    return {
      worksheet,
      questionCount: worksheetQuestions.length,
      submittedCount: submittedStudentIds.size,
      scoredCount: scores.length,
      classMean: scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1)) : null,
      median: median(scores),
      distribution,
      missingStudents,
    };
  });

  const questionMetrics = input.questions.map((question) => {
    const questionAnswers = answers.filter((answer) => answer.questionId === question.id);
    const correctCount = questionAnswers.filter((answer) => answer.result === "correct").length;
    const awarded = questionAnswers.reduce((sum, answer) => sum + answer.scoreAwarded, 0);
    const maximum = questionAnswers.length * question.score;
    return {
      question,
      responseCount: questionAnswers.length,
      correctCount,
      accuracy: percentage(correctCount, questionAnswers.length),
      scoreRate: percentage(awarded, maximum),
    };
  }).sort((a, b) => (a.scoreRate ?? 101) - (b.scoreRate ?? 101));

  const standardMetrics = input.standards.map((standard) => {
    const standardAnswers = answers.filter((answer) => questionsById.get(answer.questionId)?.achievementStandardId === standard.id);
    const awarded = standardAnswers.reduce((sum, answer) => sum + answer.scoreAwarded, 0);
    const maximum = standardAnswers.reduce((sum, answer) => sum + (questionsById.get(answer.questionId)?.score ?? 0), 0);
    const scoreRate = percentage(awarded, maximum);
    return { standard, responseCount: standardAnswers.length, scoreRate, level: performanceLevel(scoreRate) };
  }).filter((metric) => metric.responseCount > 0);

  const studentMetrics = input.students.map((student) => {
    const studentSubmissions = latest.filter((submission) => submission.studentId === student.id).sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
    const standardHistory = new Map<string, Array<{ submittedAt: string | null; scoreRate: number }>>();
    const incorrectCounts = new Map<string, number>();
    for (const submission of studentSubmissions) {
      const grouped = new Map<string, AnalyticsAnswer[]>();
      for (const answer of answersBySubmission.get(submission.id) ?? []) {
        const question = questionsById.get(answer.questionId);
        if (!question) continue;
        grouped.set(question.achievementStandardId, [...(grouped.get(question.achievementStandardId) ?? []), answer]);
        if (answer.result === "incorrect" || answer.result === "unreadable") {
          incorrectCounts.set(question.achievementStandardId, (incorrectCounts.get(question.achievementStandardId) ?? 0) + 1);
        }
      }
      for (const [standardId, groupedAnswers] of grouped) {
        const awarded = groupedAnswers.reduce((sum, answer) => sum + answer.scoreAwarded, 0);
        const maximum = groupedAnswers.reduce((sum, answer) => sum + (questionsById.get(answer.questionId)?.score ?? 0), 0);
        const scoreRate = percentage(awarded, maximum);
        if (scoreRate !== null) standardHistory.set(standardId, [...(standardHistory.get(standardId) ?? []), { submittedAt: submission.submittedAt, scoreRate }]);
      }
    }
    const standards = [...standardHistory.entries()].map(([standardId, history]) => {
      const current = history.at(-1)?.scoreRate ?? null;
      return {
        standard: standardsById.get(standardId) ?? { id: standardId, code: "알 수 없음", description: "" },
        history,
        current,
        level: performanceLevel(current),
        trend: trendLabel(history.map((item) => item.scoreRate)),
      };
    });
    const repeatedIncorrect = [...incorrectCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([standardId, count]) => ({ standard: standardsById.get(standardId) ?? { id: standardId, code: "알 수 없음", description: "" }, count }));
    return {
      student,
      recentSubmissions: [...studentSubmissions].reverse().slice(0, 5),
      standards,
      repeatedIncorrect,
    };
  });

  return { latestSubmissions: latest, activitySummaries, questionMetrics, standardMetrics, studentMetrics };
}
