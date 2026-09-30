import type { GeometryDiagram } from "@/lib/worksheet";

type Props = { diagram: GeometryDiagram; className?: string };

export function GeometryDiagram({ diagram, className }: Props) {
  const labels = [...diagram.labels, "ㄱ", "ㄴ", "ㄷ", "ㄹ"];
  if (diagram.kind === "angle") {
    return <svg className={className} viewBox="0 0 220 120" role="img" aria-label="각을 나타낸 그림"><path d="M42 92 L108 55 L184 92" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><path d="M83 70 A29 29 0 0 1 132 70" fill="none" stroke="currentColor" strokeWidth="2" /><text x="31" y="108">{labels[0]}</text><text x="103" y="48">{labels[1]}</text><text x="187" y="108">{labels[2]}</text></svg>;
  }
  if (diagram.kind === "triangle") {
    return <svg className={className} viewBox="0 0 220 130" role="img" aria-label="삼각형 그림"><path d="M110 18 L32 110 L190 110 Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /><text x="105" y="14">{labels[0]}</text><text x="18" y="124">{labels[1]}</text><text x="193" y="124">{labels[2]}</text></svg>;
  }
  return <svg className={className} viewBox="0 0 220 130" role="img" aria-label="사각형 그림"><path d="M48 28 L169 18 L184 104 L37 113 Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /><text x="36" y="25">{labels[0]}</text><text x="172" y="17">{labels[1]}</text><text x="188" y="117">{labels[2]}</text><text x="22" y="124">{labels[3]}</text></svg>;
}
