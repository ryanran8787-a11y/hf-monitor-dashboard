"use client";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function TrendChart({ data }: { data: { name: string; value: number }[] }) {
  const short = data.map((d) => ({ ...d, name: d.name.length > 18 ? d.name.slice(0, 17) + "…" : d.name }));
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={short}>
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#a1a1aa" }} interval={0} angle={-20} height={60} />
          <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} width={60} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
          <Tooltip
            contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }}
            formatter={(v: any) => [Number(v).toLocaleString(), ""]}
          />
          <Bar dataKey="value" fill="#38bdf8" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
