"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme, chartTheme } from "@/lib/theme";

export interface HistPoint {
  t: string;
  likes: number;
  downloads: number;
}

export default function HistoryLine({ data }: { data: HistPoint[] }) {
  const { theme } = useTheme();
  const c = chartTheme(theme === "dark");
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: c.tick }} minTickGap={40} />
          <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "#0284c7" }} width={60} />
          <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "#ea580c" }} width={70} />
          <Tooltip contentStyle={{ background: c.tipBg, border: `1px solid ${c.tipBd}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: c.tipTx }} />
          <Legend wrapperStyle={{ fontSize: 12, color: c.legend }} />
          <Line yAxisId="l" type="monotone" dataKey="likes" name="Likes" stroke="#0ea5e9" dot={false} strokeWidth={2} />
          <Line yAxisId="r" type="monotone" dataKey="downloads" name="Downloads" stroke="#f97316" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
