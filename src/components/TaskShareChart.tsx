"use client";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ShareSeries {
  key: string;
  label: string;
  color: string;
}

// 流派趨勢：每輪各 task 的 likes 佔比堆疊（%）。只吃有 task 欄位的輪次。
export default function TaskShareChart({ data, series }: { data: Record<string, any>[]; series: ShareSeries[] }) {
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <AreaChart data={data}>
          <CartesianGrid stroke="#ececf1" strokeDasharray="3 3" />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#71717a" }} minTickGap={60} />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "#71717a" }}
            width={50}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={{ background: "#ffffff", border: "1px solid #e4e4e7", borderRadius: 8, fontSize: 12 }}
            formatter={(v: any) => (v == null ? ["-", ""] : [`${Number(v).toFixed(1)}%`, ""])}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stackId="1"
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.55}
              dot={false}
              strokeWidth={1.5}
              connectNulls={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
