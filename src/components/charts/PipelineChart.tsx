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
 * 30-day pipeline activity. Three area series — sends (emerald), replies
 * (sky), conversions (amber). Light-theme axes, grid and tooltip.
 */
export function PipelineChart({ data }: Props) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id="grad-sends" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#059669" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="grad-replies" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0284c7" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#0284c7" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="grad-conversions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d97706" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#d97706" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e4e4e7" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#a1a1aa", fontSize: 10, fontFamily: "var(--font-sans)" }}
            tickLine={false}
            axisLine={{ stroke: "#e4e4e7" }}
            interval={Math.floor(data.length / 6)}
          />
          <YAxis
            tick={{ fill: "#a1a1aa", fontSize: 10, fontFamily: "var(--font-sans)" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={36}
          />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #e4e4e7",
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "var(--font-sans)",
              padding: "8px 12px",
              boxShadow: "0 4px 12px rgba(24, 24, 27, 0.08)",
            }}
            labelStyle={{ color: "#52525b", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}
            cursor={{ stroke: "#d4d4d8", strokeWidth: 1 }}
          />
          <Legend
            iconType="circle"
            iconSize={6}
            wrapperStyle={{ fontSize: 11, color: "#52525b", fontFamily: "var(--font-sans)", paddingLeft: 32 }}
          />
          <Area
            type="monotone"
            dataKey="sends"
            name="Sends"
            stroke="#059669"
            strokeWidth={1.8}
            fill="url(#grad-sends)"
          />
          <Area
            type="monotone"
            dataKey="replies"
            name="Replies"
            stroke="#0284c7"
            strokeWidth={1.8}
            fill="url(#grad-replies)"
          />
          <Area
            type="monotone"
            dataKey="conversions"
            name="Conversions"
            stroke="#d97706"
            strokeWidth={1.8}
            fill="url(#grad-conversions)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
