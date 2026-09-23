"use client";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme, chartTheme } from "@/lib/theme";

export default function TrendChart({ data }: { data: { name: string; value: number }[] }) {
  const { theme } = useTheme();
  const c = chartTheme(theme === "dark");
  const short = data.map((d) => ({ ...d, name: d.name.length > 18 ? d.name.slice(0, 17) + "…" : d.name }));
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={short}>
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: c.tick }} interval={0} angle={-20} height={60} />
          <YAxis tick={{ fontSize: 11, fill: c.tick }} width={60} tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
          <Tooltip
            contentStyle={{ background: c.tipBg, border: `1px solid ${c.tipBd}`, borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: c.tipTx }}
            formatter={(v: any) => [Number(v).toLocaleString(), ""]}
          />
          <Bar dataKey="value" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
