// 全站載入骨架：server component 取數時先顯示，避免白屏
function SkeletonBar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800 ${className ?? ""}`} />;
}

export default function RootLoading() {
  return (
    <main className="grid gap-4" aria-busy="true" aria-label="載入中">
      <div className="card">
        <SkeletonBar className="h-4 w-2/3" />
        <div className="mt-3 flex gap-2">
          <SkeletonBar className="h-7 w-16 !rounded-full" />
          <SkeletonBar className="h-7 w-16 !rounded-full" />
          <SkeletonBar className="h-7 w-16 !rounded-full" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card">
            <SkeletonBar className="h-3 w-1/2" />
            <SkeletonBar className="mt-2 h-8 w-3/4" />
          </div>
        ))}
      </div>
      <div className="card">
        <SkeletonBar className="mb-3 h-4 w-40" />
        <SkeletonBar className="h-64 w-full" />
      </div>
    </main>
  );
}
