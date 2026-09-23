// 流派版圖：當期熱門榜按 task 分組（席次 + likes 總和），純 CSS 橫條。
export interface TaskSlice {
  task: string;
  count: number;
  likes: number;
}

export default function TaskBars({ items, totalLikes }: { items: TaskSlice[]; totalLikes: number }) {
  if (items.length === 0 || totalLikes <= 0) return <p className="muted">尚無 task 資料。</p>;
  return (
    <div className="grid gap-2">
      {items.map((s) => {
        const pct = (s.likes / totalLikes) * 100;
        return (
          <div key={s.task} className="grid grid-cols-[104px_1fr_auto] items-center gap-2 sm:grid-cols-[150px_1fr_auto] sm:gap-3">
            <span className="truncate font-mono text-[13px]" title={s.task}>
              {s.task}
            </span>
            <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-sky-600" style={{ width: `${Math.max(pct, 2)}%` }} />
            </div>
            <span className="muted whitespace-nowrap text-xs tabular-nums">
              {s.count} 席 · {pct.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
