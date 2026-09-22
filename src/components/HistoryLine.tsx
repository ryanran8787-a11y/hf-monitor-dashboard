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
          <CartesianGrid stroke="#ececf1" strokeDasharray="3 3" />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#71717a" }} minTickGap={40} />
          <YAxis yAxisId="l" tick={{ fontSize: 11, fill: "#0284c7" }} width={60} />
          <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: "#ea580c" }} width={70} />
          <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e4e4e7", borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line yAxisId="l" type="monotone" dataKey="likes" name="Likes" stroke="#0ea5e9" dot={false} strokeWidth={2} />
          <Line yAxisId="r" type="monotone" dataKey="downloads" name="Downloads" stroke="#f97316" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
