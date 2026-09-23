"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const Ctx = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });

// 主題狀態：初次渲染跟 localStorage/系統（由 layout 內嵌腳本先寫好 html.dark），之後由切換鈕控制。
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const n: Theme = t === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", n === "dark");
      try {
        localStorage.setItem("hf-theme", n);
      } catch {
        // 無痕模式等寫不進去就算了
      }
      return n;
    });
  }, []);

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}

export interface ChartColors {
  grid: string;
  tick: string;
  tipBg: string;
  tipBd: string;
  tipTx: string;
  legend: string;
}

// 圖表色票：線條系列色兩邊通用，只有裝潢色隨主題換。
export function chartTheme(dark: boolean): ChartColors {
  return dark
    ? { grid: "#27272a", tick: "#a1a1aa", tipBg: "#18181b", tipBd: "#3f3f46", tipTx: "#e4e4e7", legend: "#d4d4d8" }
    : { grid: "#ececf1", tick: "#71717a", tipBg: "#ffffff", tipBd: "#e4e4e7", tipTx: "#18181b", legend: "#52525b" };
}
