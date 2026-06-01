"use client";

import { PictureMetrics } from "@/types";

// POS colour palette
const POS_COLORS = {
  Nouns:          "#7c3aed",
  Verbs:          "#10b981",
  "Adj / Adv":    "#f59e0b",
  "Function wds": "#94a3b8",
  Other:          "#e2e8f0",
};

interface StatBadgeProps { label: string; value: string; sub?: string; color?: string }
function StatBadge({ label, value, sub, color = "#7c3aed" }: StatBadgeProps) {
  return (
    <div style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px",
      border: "1px solid #f1f5f9", textAlign: "center" }}>
      <p style={{ margin: 0, fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.07em", color: "#9ca3af" }}>{label}</p>
      <p style={{ margin: "3px 0 0", fontSize: "1.3rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ margin: "2px 0 0", fontSize: "0.6rem", color: "#9ca3af" }}>{sub}</p>}
    </div>
  );
}

export function NlpCharts({ metrics }: { metrics: PictureMetrics }) {
  const { nounRatio, verbRatio, adjAdvRatio, funcWordRatio,
          lexicalDensity, msttr, meanSentenceLength, fillerWordRate, totalWords } = metrics;

  const hasNlp = nounRatio != null && verbRatio != null;

  if (!hasNlp) {
    return (
      <div style={{ background: "#f8fafc", borderRadius: 10, padding: "20px 16px",
        textAlign: "center", color: "#94a3b8", fontSize: "0.78rem",
        border: "1px dashed #e2e8f0" }}>
        <p style={{ margin: 0, fontWeight: 600, color: "#64748b" }}>NLP metrics — not available</p>
        <p style={{ margin: "4px 0 0" }}>Requires WhisperX transcription for the picture description task</p>
      </div>
    );
  }

  const other = Math.max(0, 100 - (nounRatio! + verbRatio! + adjAdvRatio! + funcWordRatio!));
  const posSlices = [
    { label: "Nouns",          value: nounRatio!    },
    { label: "Verbs",          value: verbRatio!    },
    { label: "Adj / Adv",      value: adjAdvRatio!  },
    { label: "Function wds",   value: funcWordRatio! },
    { label: "Other",          value: other         },
  ].filter(s => s.value > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* POS stacked bar */}
      <div>
        <p style={{ margin: "0 0 8px", fontSize: "0.72rem", fontWeight: 700, color: "#64748b",
          textTransform: "uppercase", letterSpacing: "0.06em" }}>Part-of-Speech Distribution</p>

        {/* Stacked bar */}
        <div style={{ height: 24, borderRadius: 99, overflow: "hidden", display: "flex",
          border: "1px solid #e2e8f0" }}>
          {posSlices.map(s => (
            <div key={s.label}
              title={`${s.label}: ${s.value.toFixed(1)}%`}
              style={{ width: `${s.value}%`, background: POS_COLORS[s.label as keyof typeof POS_COLORS] ?? "#e2e8f0",
                transition: "width 0.5s ease" }} />
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 8 }}>
          {posSlices.map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0,
                background: POS_COLORS[s.label as keyof typeof POS_COLORS] ?? "#e2e8f0" }} />
              <span style={{ fontSize: "0.68rem", color: "#374151", fontWeight: 600 }}>
                {s.label} <span style={{ color: "#9ca3af", fontWeight: 400 }}>{s.value.toFixed(1)}%</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Lexical / discourse stat row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8 }}>
        {lexicalDensity != null && (
          <StatBadge label="Lexical Density" value={`${lexicalDensity}%`}
            sub="content words" color="#7c3aed" />
        )}
        {msttr != null && (
          <StatBadge label="MSTTR" value={msttr.toFixed(2)}
            sub="lexical diversity" color="#10b981" />
        )}
        {meanSentenceLength != null && (
          <StatBadge label="Sentence Length" value={`${meanSentenceLength}`}
            sub="words / sentence" color="#3b82f6" />
        )}
        {fillerWordRate != null && (
          <StatBadge label="Filler Rate" value={`${fillerWordRate}`}
            sub="per minute" color={fillerWordRate > 5 ? "#f97316" : "#64748b"} />
        )}
        {totalWords != null && (
          <StatBadge label="Total Words" value={`${totalWords}`}
            sub="in transcript" color="#64748b" />
        )}
      </div>
    </div>
  );
}
