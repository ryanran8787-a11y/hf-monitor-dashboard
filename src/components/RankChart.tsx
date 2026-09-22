"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface RankSeries {
  key: string;
  label: string;
  color: string;
}

// data: 每個時間點各榜單排名（缺值=當輪沒進該榜前20，畫斷線）
// 排名越小越好，Y 軸反轉。
export default function RankChart({ data, series }: { data: Record<string, any>[]; series: RankSeries[] }) {
  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid stroke="#ececf1" strokeDasharray="3 3" />
          <XAxis dataKey="t" tick={{ fontSize: 11, fill: "#71717a" }} minTickGap={50} />
          <YAxis
            reversed
            domain={[1, "dataMax"]}
            tick={{ fontSize: 11, fill: "#71717a" }}
            width={50}
            tickFormatter={(v: number) => `#${v}`}
          />
          <Tooltip
            contentStyle={{ background: "#ffffff", border: "1px solid #e4e4e7", borderRadius: 8, fontSize: 12 }}
            formatter={(v: any) => (v == null ? ["未進榜", ""] : [`#${v}`, ""])}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
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
