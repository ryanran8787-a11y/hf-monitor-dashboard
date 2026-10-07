"use client";
import { useEffect, useRef, useState } from "react";

// 數字 300ms count-up；省電模式直接顯示終值
export default function CountUp({ value, className }: { value: number; className?: string }) {
  const [n, setN] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) {
      setN(value);
      return;
    }
    first.current = false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 300);
      setN(Math.round(value * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{n.toLocaleString()}</span>;
}
