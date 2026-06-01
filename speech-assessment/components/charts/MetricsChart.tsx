"use client";

import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, Legend, Tooltip,
} from "recharts";
import { DDKMetrics, DaysMetrics, PictureMetrics, TaskResult } from "@/types";
import { VsaChart } from "./VsaChart";
import { NlpCharts } from "./NlpCharts";

// ── Shared design tokens ──────────────────────────────────────────────────────
const C = {
  purple: "#7c3aed", green: "#10b981", teal: "#14b8a6",
  amber:  "#f59e0b", rose:  "#ef4444", blue: "#3b82f6",
  indigo: "#6366f1", slate: "#64748b", lime: "#84cc16",
};

function scoreColor(v: number, lo = 70, hi = 85) {
  if (v >= hi) return C.green;
  if (v >= lo) return C.amber;
  return C.rose;
}

// ── StatBadge — centred label / large value / optional sub ───────────────────
function StatBadge({ label, value, sub, color = C.purple }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div style={{
      background: "#f8fafc", borderRadius: 10, padding: "10px 12px",
      border: "1px solid #f1f5f9", textAlign: "center", flex: 1, minWidth: 90,
    }}>
      <p style={{ margin: 0, fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.07em", color: "#9ca3af" }}>{label}</p>
      <p style={{ margin: "3px 0 0", fontSize: "1.25rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ margin: "2px 0 0", fontSize: "0.6rem", color: "#9ca3af" }}>{sub}</p>}
    </div>
  );
}

// ── MetricBar — label + value + coloured progress bar + optional norm tick ───
function MetricBar({ label, value, unit = "%", max = 100, color, normAt, lowIsBetter = false }: {
  label: string; value: number; unit?: string; max?: number;
  color: string; normAt?: number; lowIsBetter?: boolean;
}) {
  const fillPct = Math.min(Math.max(value / max * 100, 0), 100);
  const normPct = normAt != null ? Math.min(normAt / max * 100, 100) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "#374151" }}>{label}</span>
        <span style={{ fontSize: "0.78rem", fontWeight: 800, color }}>{value.toFixed(1)}{unit}</span>
      </div>
      <div style={{ position: "relative", height: 7, borderRadius: 99, background: "#f1f5f9", overflow: "visible" }}>
        <div style={{
          height: "100%", width: `${fillPct}%`, background: color,
          borderRadius: 99, transition: "width 0.5s ease",
        }} />
        {normPct != null && (
          <div style={{
            position: "absolute", top: -3, left: `${normPct}%`,
            width: 2, height: 13, background: "#94a3b8",
            borderRadius: 1, transform: "translateX(-50%)",
          }} title={`Norm: ${normAt}${unit}`} />
        )}
      </div>
      {normPct != null && (
        <p style={{ margin: 0, fontSize: "0.58rem", color: "#9ca3af", textAlign: "right" }}>
          norm {normAt}{unit}
        </p>
      )}
    </div>
  );
}

// ── SectionLabel — small uppercase heading ────────────────────────────────────
function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{
      margin: "0 0 8px", fontSize: "0.68rem", fontWeight: 700, color: "#64748b",
      textTransform: "uppercase", letterSpacing: "0.07em",
    }}>{children}</p>
  );
}

// ── Days of the Week charts ───────────────────────────────────────────────────
export function DaysCharts({ metrics }: { metrics: DaysMetrics }) {
  const waColor  = scoreColor(metrics.wordAccuracy,    90, 95);
  const paColor  = scoreColor(metrics.phonemeAccuracy, 78, 88);
  const werColor = metrics.wer * 100 < 5 ? C.green : metrics.wer * 100 < 15 ? C.amber : C.rose;
  const perColor = metrics.phonemeErrorRate * 100 < 12 ? C.green : metrics.phonemeErrorRate * 100 < 25 ? C.amber : C.rose;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Accuracy bars */}
      <div>
        <SectionLabel>Recognition Accuracy</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <MetricBar label="Word Accuracy"    value={metrics.wordAccuracy}    color={waColor} normAt={95} />
          <MetricBar label="Phoneme Accuracy" value={metrics.phonemeAccuracy} color={paColor} normAt={85} />
        </div>
      </div>

      {/* Error rate badges */}
      <div>
        <SectionLabel>Error Rates</SectionLabel>
        <div style={{ display: "flex", gap: 10 }}>
          <StatBadge
            label="Word Error Rate"
            value={`${(metrics.wer * 100).toFixed(1)}%`}
            sub="lower is better"
            color={werColor}
          />
          <StatBadge
            label="Phoneme Error Rate"
            value={`${(metrics.phonemeErrorRate * 100).toFixed(1)}%`}
            sub="lower is better"
            color={perColor}
          />
        </div>
      </div>

    </div>
  );
}

// ── DDK charts ────────────────────────────────────────────────────────────────
export function DDKCharts({ metrics }: { metrics: DDKMetrics }) {
  const positions = ["P", "A", "T", "A", "K", "A"];
  const _rc       = metrics.overallDdkRateCps >= 6.0 ? C.green : metrics.overallDdkRateCps >= 4.5 ? C.amber : C.rose;
  const ioiColor  = metrics.ioiCv < 0.15 ? C.green : metrics.ioiCv < 0.25 ? C.amber : C.rose;
  const cleanColor = scoreColor(metrics.cleanRatePct, 60, 80);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Top stat badges */}
      <div>
        <SectionLabel>Syllable Repetition Metrics</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatBadge label="Attempts"   value={`${metrics.nAttempts}`} sub="total"          color={C.slate}   />
          <StatBadge label="Clean"      value={`${metrics.nClean}`}    sub="syllables"       color={C.indigo}  />
          <StatBadge label="Clean Rate" value={`${metrics.cleanRatePct.toFixed(0)}%`} sub="norm ≥80%" color={cleanColor} />
          <StatBadge label="DDK Rate"   value={`${metrics.overallDdkRateCps.toFixed(1)}`} sub="syl/s · norm 6" color={_rc} />
          <StatBadge label="IOI CV"     value={metrics.ioiCv.toFixed(2)} sub="regularity"   color={ioiColor}  />
        </div>
      </div>

      {/* Phoneme accuracy by position */}
      <div>
        <SectionLabel>Phoneme Accuracy by Position (PA-TA-KA)</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {metrics.phonemeAccuracyByPos.map((acc, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                background: scoreColor(acc, 70, 85) + "22",
                color: scoreColor(acc, 70, 85),
                fontSize: "0.72rem", fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                {positions[i]}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ position: "relative", height: 7, borderRadius: 99, background: "#f1f5f9" }}>
                  <div style={{
                    height: "100%", width: `${acc}%`,
                    background: scoreColor(acc, 70, 85),
                    borderRadius: 99,
                  }} />
                  {/* 85% norm line */}
                  <div style={{
                    position: "absolute", top: -3, left: "85%",
                    width: 2, height: 13, background: "#94a3b8", borderRadius: 1,
                  }} />
                </div>
              </div>
              <span style={{
                fontSize: "0.72rem", fontWeight: 800, width: 44, textAlign: "right",
                color: scoreColor(acc, 70, 85),
              }}>{acc.toFixed(1)}%</span>
            </div>
          ))}
          <p style={{ margin: "2px 0 0", fontSize: "0.58rem", color: "#9ca3af", textAlign: "right" }}>
            grey tick = 85% norm
          </p>
        </div>
      </div>

      {/* Rate + timing */}
      <div>
        <SectionLabel>Timing</SectionLabel>
        <div style={{ display: "flex", gap: 8 }}>
          <StatBadge label="IOI Mean"       value={`${metrics.ioiMeanS.toFixed(3)}s`}  sub="inter-onset interval" color={C.slate}  />
          <StatBadge label="Best Clean Rate" value={`${metrics.bestCleanDdkRateCps.toFixed(1)}`} sub="syl/s peak" color={C.indigo} />
          <StatBadge label="Best PER"        value={`${(metrics.bestPer * 100).toFixed(1)}%`}    sub="phoneme err" color={C.slate}  />
        </div>
      </div>

    </div>
  );
}

// ── Picture Description charts ────────────────────────────────────────────────
export function PictureCharts({ metrics }: { metrics: PictureMetrics }) {
  const intColor   = scoreColor(metrics.intelligibilityScore, 70, 85);
  const natColor   = scoreColor(metrics.naturalnessScore,     65, 80);
  const rateColor  = metrics.speechRate >= 4.5 ? C.green : metrics.speechRate >= 3.0 ? C.amber : C.rose;
  const pauseColor = metrics.pauseRate  <= 10  ? C.green : metrics.pauseRate  <= 20   ? C.amber : C.rose;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Intelligibility + Naturalness bars */}
      <div>
        <SectionLabel>Perceptual Quality</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <MetricBar label="Intelligibility" value={metrics.intelligibilityScore} color={intColor}  normAt={85} />
          <MetricBar label="Naturalness"     value={metrics.naturalnessScore}     color={natColor}  normAt={80} />
        </div>
      </div>

      {/* Speech dynamics badges */}
      <div>
        <SectionLabel>Speech Dynamics</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StatBadge label="Speech Rate" value={`${metrics.speechRate.toFixed(1)}`}  sub="syl/s · norm 4.5" color={rateColor}  />
          <StatBadge label="Pause Rate"  value={`${metrics.pauseRate.toFixed(1)}`}   sub="/min · norm <20"  color={pauseColor} />
          {metrics.vsaHz2 != null && (
            <StatBadge label="VSA" value={`${(metrics.vsaHz2 / 1000).toFixed(0)}k`} sub="Hz² · norm 280k"  color={C.indigo}   />
          )}
        </div>
      </div>

      {/* Vowel Space scatter */}
      <div>
        <SectionLabel>Vowel Space — F1 × F2</SectionLabel>
        <VsaChart metrics={metrics} />
      </div>

      {/* Language / NLP */}
      <div>
        <SectionLabel>Language Analysis</SectionLabel>
        <NlpCharts metrics={metrics} />
      </div>

    </div>
  );
}

// ── Summary radar — kept for PDF capture only, not shown on screen ────────────
const TASK_SHORT: Record<string, string> = {
  days_of_week: "Days", ddk: "DDK", picture_description: "Picture",
};

export function SummaryRadarChart({ results }: { results: TaskResult[] }) {
  const metrics = [
    { axis: "Word Acc.",      getValue: (r: TaskResult) => r.taskId === "days_of_week" ? (r.metrics as DaysMetrics).wordAccuracy : null },
    { axis: "Phoneme Acc.",   getValue: (r: TaskResult) => r.taskId === "days_of_week" ? (r.metrics as DaysMetrics).phonemeAccuracy : null },
    { axis: "DDK Rate",       getValue: (r: TaskResult) => r.taskId === "ddk" ? Math.min((r.metrics as DDKMetrics).overallDdkRateCps / 9 * 100, 100) : null },
    { axis: "Clean Rate",     getValue: (r: TaskResult) => r.taskId === "ddk" ? (r.metrics as DDKMetrics).cleanRatePct : null },
    { axis: "Intelligibility",getValue: (r: TaskResult) => r.taskId === "picture_description" ? (r.metrics as PictureMetrics).intelligibilityScore : null },
    { axis: "Naturalness",    getValue: (r: TaskResult) => r.taskId === "picture_description" ? (r.metrics as PictureMetrics).naturalnessScore : null },
  ];
  const data = metrics.map(({ axis, getValue }) => {
    const row: Record<string, string | number> = { axis };
    results.forEach((r) => { const v = getValue(r); row[TASK_SHORT[r.taskId] || r.taskId] = v ?? 0; });
    return row;
  });
  const colors = [C.purple, C.green, C.amber];
  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
        {results.map((r, i) => (
          <Radar key={r.taskId} name={TASK_SHORT[r.taskId] || r.taskId}
            dataKey={TASK_SHORT[r.taskId] || r.taskId}
            stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.18} />
        ))}
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
