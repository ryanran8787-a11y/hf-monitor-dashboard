"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme, chartTheme } from "@/lib/theme";

export interface CSeries {
  key: string;
  label: string;
  color: string;
}

function kfmt(v: number) {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `${v}`;
}

// 通用對比折線：likes / downloads 各一張（排名對比直接复用 RankChart）。
export default function CompareChart({ data, series }: { data: Record<string, any>[]; series: CSeries[] }) {
  const { theme } = useTheme();
  const c = chartTheme(theme === "dark");
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: c.tick }} minTickGap={60} />
          <YAxis tick={{ fontSize: 11, fill: c.tick }} width={60} tickFormatter={(v: number) => kfmt(v)} />
          <Tooltip
            contentStyle={{ background: c.tipBg, border: `1px solid ${c.tipBd}`, borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: c.tipTx }}
            formatter={(v: any) => (v == null ? ["-", ""] : [Number(v).toLocaleString(), ""])}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: c.legend }} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              dot={false}
              strokeWidth={2}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
