type Point = { scoreRate: number; submittedAt?: string | null };

export function ScoreHistory({ points }: { points: Point[] }) {
  if (!points.length) return <span className="muted">기록 없음</span>;
  return <div className="score-history" aria-label={`오래된 순서부터 최근까지 ${points.map((point) => `${point.scoreRate}%`).join(", ")}`}>
    <div className="score-history-bars">{points.map((point, index) => <span key={`${point.submittedAt ?? "result"}-${index}`} style={{ height: `${Math.max(5, point.scoreRate)}%` }} title={`${point.scoreRate}%${point.submittedAt ? ` · ${new Date(point.submittedAt).toLocaleDateString("ko-KR")}` : ""}`} />)}</div>
    <small>이전 <span aria-hidden>→</span> 최근</small>
  </div>;
}
