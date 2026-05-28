"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { DDKMetrics, DaysMetrics, PictureMetrics, TaskResult } from "@/types";

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  purple:  "#7c3aed",
  violet:  "#a78bfa",
  green:   "#10b981",
  teal:    "#14b8a6",
  amber:   "#f59e0b",
  rose:    "#f43f5e",
  blue:    "#3b82f6",
  indigo:  "#6366f1",
  slate:   "#64748b",
};

// ── SVG half-circle gauge ─────────────────────────────────────────────────────
function Gauge({ value, max = 100, label, unit = "%", color = C.purple, size = 160 }: {
  value: number; max?: number; label: string; unit?: string; color?: string; size?: number;
}) {
  const pct   = Math.min(Math.max(value / max, 0), 1);
  const r     = size * 0.38;
  const cx    = size / 2;
  const cy    = size * 0.54;
  const start = Math.PI;
  const end   = start + pct * Math.PI;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  // Track is the full upper semicircle (left → top → right, CW, 180°).
  // Colored arc always spans ≤ 180° so large-arc-flag must be 0.
  // (Using 1 for pct > 0.5 incorrectly routes the arc through the bottom.)
  const track = `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy}`;
  const arc   = pct < 0.01 ? "" : `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`}>
        <path d={track} fill="none" stroke="#e5e7eb" strokeWidth={size * 0.09} strokeLinecap="round" />
        {arc && <path d={arc} fill="none" stroke={color} strokeWidth={size * 0.09} strokeLinecap="round" />}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={size * 0.20} fontWeight={700} fill="#111827">
          {value.toFixed(1)}{unit}
        </text>
      </svg>
      <p style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151", margin: 0, textAlign: "center" }}>{label}</p>
    </div>
  );
}

// ── Days of the Week charts ───────────────────────────────────────────────────
export function DaysCharts({ metrics }: { metrics: DaysMetrics }) {
  const errorData = [
    { name: "WER",  value: +(metrics.wer * 100).toFixed(1),             fill: C.rose },
    { name: "PER",  value: +(metrics.phonemeErrorRate * 100).toFixed(1), fill: C.amber },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Accuracy gauges */}
      <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 8 }}>
        <Gauge value={metrics.wordAccuracy}    label="Word Accuracy"    color={C.purple} />
        <Gauge value={metrics.phonemeAccuracy} label="Phoneme Accuracy" color={C.green}  />
      </div>
      {/* Error rate bar */}
      <div>
        <p style={{ fontSize: "0.72rem", fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Error Rates</p>
        <ResponsiveContainer width="100%" height={110}>
          <BarChart data={errorData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
            <XAxis type="number" domain={[0, 30]} unit="%" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} width={34} />
            <Tooltip formatter={(v) => [`${v}%`]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={22}>
              {errorData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
            <ReferenceLine x={10} stroke="#94a3b8" strokeDasharray="4 3" label={{ value: "10%", fontSize: 10, fill: "#94a3b8" }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── DDK charts ────────────────────────────────────────────────────────────────
export function DDKCharts({ metrics }: { metrics: DDKMetrics }) {
  const positions = ["P", "A", "T", "A", "K", "A"];
  const posData   = metrics.phonemeAccuracyByPos.map((v, i) => ({
    pos: positions[i], accuracy: v,
    fill: v >= 85 ? C.green : v >= 70 ? C.amber : C.rose,
  }));

  const perData = [
    { name: "Best PER",        value: +(metrics.bestPer    * 100).toFixed(1) },
    { name: "Mean PER (clean)", value: +(metrics.meanPerClean * 100).toFixed(1) },
    { name: "Mean PER (all)",  value: +(metrics.meanPerAll  * 100).toFixed(1) },
  ];

  const rateData = [
    { name: "Overall Rate",    value: metrics.overallDdkRateCps },
    { name: "Best Clean Rate", value: metrics.bestCleanDdkRateCps },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Stat row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
        {[
          { label: "Attempts",   value: metrics.nAttempts, unit: "" },
          { label: "Clean",      value: metrics.nClean,    unit: "" },
          { label: "Clean Rate", value: metrics.cleanRatePct, unit: "%" },
          { label: "IOI Mean",   value: metrics.ioiMeanS,  unit: "s" },
        ].map(({ label, value, unit }) => (
          <div key={label} style={{ background: "#f5f3ff", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
            <p style={{ fontSize: "0.65rem", fontWeight: 700, color: C.purple, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{label}</p>
            <p style={{ fontSize: "1.25rem", fontWeight: 800, color: "#111827", margin: "2px 0 0" }}>{value}{unit}</p>
          </div>
        ))}
      </div>

      {/* Phoneme accuracy by position */}
      <div>
        <p style={{ fontSize: "0.72rem", fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Phoneme Accuracy by Position</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={posData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="pos" tick={{ fontSize: 13, fontWeight: 700 }} />
            <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) =>[`${v}%`, "Accuracy"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <ReferenceLine y={85} stroke={C.green}  strokeDasharray="4 3" label={{ value: "85%", fontSize: 9, fill: C.green, position: "right" }} />
            <Bar dataKey="accuracy" radius={[4, 4, 0, 0]} barSize={28}>
              {posData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* DDK rate + PER side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <p style={{ fontSize: "0.72rem", fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>DDK Rate (cps)</p>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={rateData} margin={{ top: 4, right: 4, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-12} textAnchor="end" />
              <YAxis domain={[0, 10]} unit="" tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) =>[`${v} cps`]} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={28} fill={C.indigo} />
              <ReferenceLine y={6} stroke={C.green} strokeDasharray="4 3" label={{ value: "Norm", fontSize: 9, fill: C.green, position: "right" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p style={{ fontSize: "0.72rem", fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Phoneme Error Rate</p>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={perData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis type="number" domain={[0, 30]} unit="%" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} />
              <Tooltip formatter={(v) =>[`${v}%`]} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18} fill={C.rose} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── Picture Description charts ────────────────────────────────────────────────
export function PictureCharts({ metrics }: { metrics: PictureMetrics }) {
  const rateData = [
    { name: "Speech Rate (syl/s)", value: metrics.speechRate },
    { name: "Pause Rate (/min)",   value: metrics.pauseRate  },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 8 }}>
        <Gauge value={metrics.intelligibilityScore} label="Intelligibility" color={C.purple} />
        <Gauge value={metrics.naturalnessScore}     label="Naturalness"    color={C.teal}   />
      </div>
      <div>
        <p style={{ fontSize: "0.72rem", fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Speech Dynamics</p>
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={rateData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={36}>
              <Cell fill={C.blue} />
              <Cell fill={C.amber} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Summary radar — key metric per task ───────────────────────────────────────
const TASK_SHORT: Record<string, string> = {
  days_of_week:      "Days",
  ddk:               "DDK",
  picture_description: "Picture",
};

export function SummaryRadarChart({ results }: { results: TaskResult[] }) {
  // One radar axis per task, key representative metric normalised 0-100
  const metrics = [
    {
      axis: "Word Acc.",
      getValue: (r: TaskResult) =>
        r.taskId === "days_of_week" ? (r.metrics as DaysMetrics).wordAccuracy : null,
    },
    {
      axis: "Phoneme Acc.",
      getValue: (r: TaskResult) =>
        r.taskId === "days_of_week" ? (r.metrics as DaysMetrics).phonemeAccuracy : null,
    },
    {
      axis: "DDK Rate",
      getValue: (r: TaskResult) =>
        r.taskId === "ddk" ? Math.min((r.metrics as DDKMetrics).overallDdkRateCps / 9 * 100, 100) : null,
    },
    {
      axis: "Clean Rate",
      getValue: (r: TaskResult) =>
        r.taskId === "ddk" ? (r.metrics as DDKMetrics).cleanRatePct : null,
    },
    {
      axis: "Intelligibility",
      getValue: (r: TaskResult) =>
        r.taskId === "picture_description" ? (r.metrics as PictureMetrics).intelligibilityScore : null,
    },
    {
      axis: "Naturalness",
      getValue: (r: TaskResult) =>
        r.taskId === "picture_description" ? (r.metrics as PictureMetrics).naturalnessScore : null,
    },
  ];

  // Flatten into radar data: one row per axis, one column per task
  const data = metrics.map(({ axis, getValue }) => {
    const row: Record<string, string | number> = { axis };
    results.forEach((r) => {
      const v = getValue(r);
      row[TASK_SHORT[r.taskId] || r.taskId] = v ?? 0;
    });
    return row;
  });

  const colors = [C.purple, C.green, C.amber];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
        {results.map((r, i) => (
          <Radar
            key={r.taskId}
            name={TASK_SHORT[r.taskId] || r.taskId}
            dataKey={TASK_SHORT[r.taskId] || r.taskId}
            stroke={colors[i % colors.length]}
            fill={colors[i % colors.length]}
            fillOpacity={0.18}
          />
        ))}
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
