"use client";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme, chartTheme } from "@/lib/theme";

export interface ShareSeries {
  key: string;
  label: string;
  color: string;
}

// 流派趨勢：各 task 佔比以首日=100 指數化折線，只看消長方向。
// （佔比本身幾乎不動，堆疊面積圖看不出變化，故不用堆疊。）
export default function TaskShareChart({ data, series }: { data: Record<string, any>[]; series: ShareSeries[] }) {
  const { theme } = useTheme();
  const c = chartTheme(theme === "dark");
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: c.tick }} minTickGap={60} />
          <YAxis
            domain={["auto", "auto"]}
            tickCount={6}
            allowDecimals={false}
            tick={{ fontSize: 11, fill: c.tick }}
            width={44}
            tickFormatter={(v: number) => `${Math.round(v)}`}
          />
          <Tooltip
            contentStyle={{ background: c.tipBg, border: `1px solid ${c.tipBd}`, borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: c.tipTx }}
            formatter={(v: any) => (v == null ? ["-", ""] : [`${Number(v).toFixed(1)}（首日=100）`, ""])}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: c.legend }} />
          <ReferenceLine y={100} stroke={c.grid} strokeDasharray="4 4" />
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
