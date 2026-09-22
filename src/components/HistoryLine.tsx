"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface HistPoint {
  t: string;
  likes: number;
  downloads: number;
}

export default function HistoryLine({ data }: { data: HistPoint[] }) {
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#a1a1aa" }} minTickGap={40} />
          <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "#38bdf8" }} width={60} />
          <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "#fb923c" }} width={70} />
          <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }} />
          <Legend />
          <Line yAxisId="l" type="monotone" dataKey="likes" name="Likes" stroke="#38bdf8" dot={false} strokeWidth={2} />
          <Line yAxisId="r" type="monotone" dataKey="downloads" name="Downloads" stroke="#fb923c" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
