"use client";

import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Day {
  key: string;
  label: string;
  sends: number;
  replies: number;
  conversions: number;
}

interface Props {
  data: Day[];
}

/**
 * 30-day pipeline activity. Three stacked area series — sends (emerald),
 * replies (sky), conversions (amber). Dark theme tooltip + gradient fills.
 */
export function PipelineChart({ data }: Props) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id="grad-sends" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="grad-replies" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="grad-conversions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1a1a23" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#5a5b66", fontSize: 10, fontFamily: "var(--font-sans)" }}
            tickLine={false}
            axisLine={{ stroke: "#1a1a23" }}
            interval={Math.floor(data.length / 6)}
          />
          <YAxis
            tick={{ fill: "#5a5b66", fontSize: 10, fontFamily: "var(--font-sans)" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={36}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(10, 10, 14, 0.95)",
              border: "1px solid #2e2e3c",
              borderRadius: 6,
              fontSize: 12,
              fontFamily: "var(--font-sans)",
              padding: "8px 12px",
              backdropFilter: "blur(8px)",
            }}
            labelStyle={{ color: "#9c9daa", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}
            cursor={{ stroke: "#2e2e3c", strokeWidth: 1 }}
          />
          <Legend
            iconType="circle"
            iconSize={6}
            wrapperStyle={{ fontSize: 11, color: "#9c9daa", fontFamily: "var(--font-sans)", paddingLeft: 32 }}
          />
          <Area
            type="monotone"
            dataKey="sends"
            name="Sends"
            stroke="#10b981"
            strokeWidth={1.8}
            fill="url(#grad-sends)"
          />
          <Area
            type="monotone"
            dataKey="replies"
            name="Replies"
            stroke="#38bdf8"
            strokeWidth={1.8}
            fill="url(#grad-replies)"
          />
          <Area
            type="monotone"
            dataKey="conversions"
            name="Conversions"
            stroke="#fbbf24"
            strokeWidth={1.8}
            fill="url(#grad-conversions)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
