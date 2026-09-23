// 迷你 sparkline（純 SVG 無依賴）：watch 清單每行一條。
export default function WatchSpark({ points }: { points: number[] }) {
  const W = 100;
  const H = 28;
  if (points.length < 2) return <span className="muted text-xs">累積中</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = W / (points.length - 1);
  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(H - 3 - ((v - min) / span) * (H - 6)).toFixed(1)}`)
    .join(" ");
  const up = points[points.length - 1] >= points[0];
  return (
    <svg width={W} height={H} className="shrink-0">
      <path d={d} fill="none" stroke={up ? "#059669" : "#e11d48"} strokeWidth="1.5" />
    </svg>
  );
}
