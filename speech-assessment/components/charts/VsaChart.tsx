"use client";

import type { PictureMetrics } from "@/types";

// One colour per ARPAbet vowel type (tab20-style palette)
const VOWEL_COLORS: Record<string, string> = {
  AA: "#e41a1c", AE: "#377eb8", AH: "#4daf4a", AO: "#984ea3", AW: "#ff7f00",
  AY: "#a65628", EH: "#f781bf", ER: "#66c2a5", EY: "#fc8d62", IH: "#8da0cb",
  IY: "#e78ac3", OW: "#a6d854", OY: "#ffd92f", UH: "#e5c494", UW: "#b15928",
};
const FALLBACK_COLOR = "#94a3b8";

// SVG layout constants
const W = 500, H = 340;
const ML = 58, MR = 24, MT = 28, MB = 48;
const PW = W - ML - MR, PH = H - MT - MB;

export function VsaChart({ metrics }: { metrics: PictureMetrics }) {
  const {
    vowelScatter  = [],
    vowelMedians  = [],
    hullPath      = [],
    vsaHz2,
    nVowelTokens  = 0,
    nVowelTypes   = 0,
  } = metrics;

  const hasData = vowelMedians.length >= 1 && nVowelTokens > 0;

  if (!hasData) {
    return (
      <div style={{
        background: "#f8fafc", borderRadius: 10, padding: "28px 16px",
        textAlign: "center", color: "#94a3b8", fontSize: "0.78rem",
        border: "1px dashed #e2e8f0",
      }}>
        <p style={{ margin: 0, fontWeight: 600, color: "#64748b" }}>Vowel Space Area — not available</p>
        <p style={{ margin: "4px 0 0" }}>Requires HuPer to return F1/F2 formant values per interval</p>
      </div>
    );
  }

  // Compute axis bounds from all points
  const allPts = [...vowelScatter, ...vowelMedians];
  const f2s    = allPts.map(p => p.f2);
  const f1s    = allPts.map(p => p.f1);
  const PAD    = 0.18;
  const f2Span = (Math.max(...f2s) - Math.min(...f2s)) || 800;
  const f1Span = (Math.max(...f1s) - Math.min(...f1s)) || 400;
  const f2Lo   = Math.min(...f2s) - f2Span * PAD;
  const f2Hi   = Math.max(...f2s) + f2Span * PAD;
  const f1Lo   = Math.min(...f1s) - f1Span * PAD;
  const f1Hi   = Math.max(...f1s) + f1Span * PAD;

  // F2 is on x-axis, INVERTED (higher F2 = further left, phonetic convention)
  const sx = (f2: number) => ML + (1 - (f2 - f2Lo) / (f2Hi - f2Lo)) * PW;
  // F1 is on y-axis, INVERTED (higher F1 = further down, i.e. open vowels at bottom)
  const sy = (f1: number) => MT + ((f1 - f1Lo) / (f1Hi - f1Lo)) * PH;

  const hullPoly = hullPath.map(p => `${sx(p.f2).toFixed(1)},${sy(p.f1).toFixed(1)}`).join(" ");

  const f2Ticks = niceTicks(f2Lo, f2Hi, 6);
  const f1Ticks = niceTicks(f1Lo, f1Hi, 5);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
    >
      {/* Grid lines */}
      {f2Ticks.map(t => (
        <line key={`gx${t}`} x1={sx(t)} y1={MT} x2={sx(t)} y2={MT + PH}
          stroke="#f1f5f9" strokeWidth={1} />
      ))}
      {f1Ticks.map(t => (
        <line key={`gy${t}`} x1={ML} y1={sy(t)} x2={ML + PW} y2={sy(t)}
          stroke="#f1f5f9" strokeWidth={1} />
      ))}

      {/* Convex hull */}
      {hullPath.length >= 3 && (
        <>
          <polygon points={hullPoly} fill="#3b82f6" fillOpacity={0.08} stroke="none" />
          <polygon points={hullPoly} fill="none" stroke="#3b82f6"
            strokeWidth={1.8} strokeDasharray="6 3" strokeLinejoin="round" />
        </>
      )}

      {/* Scatter tokens (individual vowel occurrences, faint) */}
      {vowelScatter.map((p, i) => (
        <circle key={i}
          cx={sx(p.f2)} cy={sy(p.f1)} r={3.5}
          fill={VOWEL_COLORS[p.phoneme] ?? FALLBACK_COLOR}
          opacity={0.22}
        />
      ))}

      {/* Median markers + labels */}
      {vowelMedians.map(p => {
        const col = VOWEL_COLORS[p.phoneme] ?? FALLBACK_COLOR;
        const x = sx(p.f2), y = sy(p.f1);
        return (
          <g key={p.phoneme}>
            <circle cx={x} cy={y} r={7} fill={col} stroke="#fff" strokeWidth={1.5} />
            <text x={x + 10} y={y + 4} fontSize={10} fontWeight={700} fill={col}
              style={{ userSelect: "none" }}>
              {p.phoneme}
            </text>
          </g>
        );
      })}

      {/* X-axis (F2) */}
      <line x1={ML} y1={MT + PH} x2={ML + PW} y2={MT + PH} stroke="#cbd5e1" strokeWidth={1} />
      {f2Ticks.map(t => (
        <g key={`xt${t}`}>
          <line x1={sx(t)} y1={MT + PH} x2={sx(t)} y2={MT + PH + 4} stroke="#cbd5e1" strokeWidth={1} />
          <text x={sx(t)} y={MT + PH + 16} textAnchor="middle" fontSize={9} fill="#6b7280">{t}</text>
        </g>
      ))}
      <text x={ML + PW / 2} y={H - 5} textAnchor="middle" fontSize={11}
        fontWeight={600} fill="#374151">
        F2 (Hz)
      </text>

      {/* Y-axis (F1) */}
      <line x1={ML} y1={MT} x2={ML} y2={MT + PH} stroke="#cbd5e1" strokeWidth={1} />
      {f1Ticks.map(t => (
        <g key={`yt${t}`}>
          <line x1={ML - 4} y1={sy(t)} x2={ML} y2={sy(t)} stroke="#cbd5e1" strokeWidth={1} />
          <text x={ML - 7} y={sy(t) + 4} textAnchor="end" fontSize={9} fill="#6b7280">{t}</text>
        </g>
      ))}
      <text x={14} y={MT + PH / 2} textAnchor="middle" fontSize={11}
        fontWeight={600} fill="#374151"
        transform={`rotate(-90, 14, ${MT + PH / 2})`}>
        F1 (Hz)
      </text>

      {/* VSA annotation (top-right) */}
      {vsaHz2 != null && (
        <>
          <text x={ML + PW - 4} y={MT + 13} textAnchor="end"
            fontSize={11} fontWeight={700} fill="#3b82f6">
            VSA = {vsaHz2.toLocaleString()} Hz²
          </text>
          <text x={ML + PW - 4} y={MT + 26} textAnchor="end"
            fontSize={9} fill="#94a3b8">
            {nVowelTokens} tokens · {nVowelTypes} vowel types · median F1/F2 per vowel
          </text>
        </>
      )}
    </svg>
  );
}

// Compute round tick values across [lo, hi]
function niceTicks(lo: number, hi: number, count: number): number[] {
  const range   = hi - lo;
  const rawStep = range / count;
  const mag     = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step    = [1, 2, 5, 10].map(f => f * mag).find(s => range / s <= count + 1) ?? mag;
  const start   = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + 1e-9; v += step) ticks.push(Math.round(v));
  return ticks;
}
