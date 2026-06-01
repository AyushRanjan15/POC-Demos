"use client";

import { DaysMetrics, DDKMetrics, DomainScores, PictureMetrics, TaskResult } from "@/types";

// ── Normative anchors (literature-based, configurable) ────────────────────────
const NORMS = {
  wordAccuracy:    95,   // % — healthy adult speech recognition
  phonemeAccuracy: 85,   // % — healthy adult phoneme production
  ddkCleanRate:    80,   // % — healthy adult DDK clean syllable rate
  ddkRateCps:      6.0,  // cps — healthy adult PA-TA-KA rate
  ioiCvMax:        0.35, // above this IOI_CV → 0 fluency score
  speechRate:      4.5,  // syl/s — healthy adult conversational rate
  pauseRateMax:    20,   // /min — above this → 0 fluency score
  vsa:             280000, // Hz² — healthy adult English VSA
  msttr:           0.72, // healthy adult picture description
  lexicalDensity:  55,   // % — healthy adult spontaneous speech
  verbRatio:       16,   // % — healthy adult spontaneous speech
  meanSentLen:     9,    // words — healthy adult sentence length
};

// ── Domain score computation ──────────────────────────────────────────────────

export function computeDomainScores(results: TaskResult[]): DomainScores {
  const days = results.find(r => r.taskId === "days_of_week")?.metrics as DaysMetrics | undefined;
  const ddk  = results.find(r => r.taskId === "ddk")?.metrics          as DDKMetrics    | undefined;
  const pic  = results.find(r => r.taskId === "picture_description")?.metrics as PictureMetrics | undefined;

  const articulation    = _articulationScore(days, ddk, pic);
  const fluency         = _fluencyScore(ddk, pic);
  const language        = _languageScore(pic);
  const intelligibility = _intelligibilityScore(pic);
  const hasNlp          = pic?.msttr != null || pic?.lexicalDensity != null || pic?.verbRatio != null;

  // Redistribute NOVA weights when Language data is absent (requires transcript)
  const novaIndex = hasNlp
    ? Math.round(0.30 * articulation + 0.25 * fluency + 0.20 * language + 0.25 * intelligibility)
    : Math.round((0.30 / 0.80) * articulation + (0.25 / 0.80) * fluency + (0.25 / 0.80) * intelligibility);

  return { articulation, fluency, language, intelligibility, novaIndex, hasNlp };
}

function _articulationScore(days?: DaysMetrics, ddk?: DDKMetrics, pic?: PictureMetrics): number {
  const pts: number[] = [];
  if (days) {
    pts.push(Math.min(days.wordAccuracy    / NORMS.wordAccuracy    * 100, 100));
    pts.push(Math.min(days.phonemeAccuracy / NORMS.phonemeAccuracy * 100, 100));
  }
  if (ddk) {
    pts.push(Math.min(ddk.cleanRatePct / NORMS.ddkCleanRate * 100, 100));
    if (ddk.phonemeAccuracyByPos.length) {
      const avg = ddk.phonemeAccuracyByPos.reduce((a, b) => a + b, 0) / ddk.phonemeAccuracyByPos.length;
      pts.push(avg);
    }
  }
  if (pic?.vsaHz2 != null) pts.push(Math.min(pic.vsaHz2 / NORMS.vsa * 100, 100));
  return pts.length ? Math.round(pts.reduce((a, b) => a + b, 0) / pts.length) : 0;
}

function _fluencyScore(ddk?: DDKMetrics, pic?: PictureMetrics): number {
  const pts: number[] = [];
  if (ddk) {
    pts.push(Math.min(ddk.overallDdkRateCps / NORMS.ddkRateCps * 100, 100));
    pts.push(Math.max(0, (NORMS.ioiCvMax - ddk.ioiCv) / NORMS.ioiCvMax * 100));
  }
  if (pic) {
    pts.push(Math.min(pic.speechRate / NORMS.speechRate * 100, 100));
    pts.push(Math.max(0, (1 - pic.pauseRate / NORMS.pauseRateMax) * 100));
  }
  return pts.length ? Math.round(pts.reduce((a, b) => a + b, 0) / pts.length) : 0;
}

function _languageScore(pic?: PictureMetrics): number {
  const pts: number[] = [];
  if (pic?.msttr          != null) pts.push(Math.min(pic.msttr          / NORMS.msttr          * 100, 100));
  if (pic?.lexicalDensity != null) pts.push(Math.min(pic.lexicalDensity / NORMS.lexicalDensity  * 100, 100));
  if (pic?.verbRatio      != null) pts.push(Math.min(pic.verbRatio      / NORMS.verbRatio       * 100, 100));
  if (pic?.meanSentenceLength != null) pts.push(Math.min(pic.meanSentenceLength / NORMS.meanSentLen * 100, 100));
  return pts.length ? Math.round(pts.reduce((a, b) => a + b, 0) / pts.length) : 0;
}

function _intelligibilityScore(pic?: PictureMetrics): number {
  if (!pic) return 0;
  return Math.round((pic.intelligibilityScore + pic.naturalnessScore) / 2);
}

// ── Visual helpers ────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  if (s >= 80) return "#10b981";
  if (s >= 65) return "#84cc16";
  if (s >= 50) return "#f59e0b";
  if (s >= 35) return "#f97316";
  return "#ef4444";
}

function severity(s: number) {
  if (s >= 80) return "Within Normal Limits";
  if (s >= 65) return "Mild";
  if (s >= 50) return "Mild–Moderate";
  if (s >= 35) return "Moderate";
  return "Severe";
}

// ── Domain card ───────────────────────────────────────────────────────────────

function DomainCard({ label, score, color, sub, noData }: {
  label: string; score: number; color: string;
  sub: { key: string; val: string }[];
  noData?: boolean;
}) {
  const sc = scoreColor(score);
  return (
    <div style={{
      background: "#fff", borderRadius: 14, border: `1px solid ${color}22`,
      padding: "1rem", display: "flex", flexDirection: "column", gap: 10,
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      opacity: noData ? 0.6 : 1,
    }}>
      {/* Header strip */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.07em", color }}>{label}</span>
        {noData
          ? <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#94a3b8", lineHeight: 1 }}>—</span>
          : <span style={{ fontSize: "1.55rem", fontWeight: 800, color: sc, lineHeight: 1 }}>{score}</span>
        }
      </div>

      {/* Progress bar */}
      {noData
        ? <div style={{ height: 6, borderRadius: 99, background: "#f1f5f9" }} />
        : <div style={{ height: 6, borderRadius: 99, background: "#f1f5f9", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${score}%`, borderRadius: 99,
              background: sc, transition: "width 0.6s ease" }} />
          </div>
      }

      {/* Sub-metric chips */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {noData
          ? <div style={{ fontSize: "0.68rem", color: "#94a3b8", fontStyle: "italic" }}>
              Requires picture description transcript
            </div>
          : sub.map(({ key, val }) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between",
                fontSize: "0.68rem", color: "#6b7280" }}>
                <span>{key}</span>
                <span style={{ fontWeight: 700, color: "#374151" }}>{val}</span>
              </div>
            ))
        }
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function DomainSummary({ results }: { results: TaskResult[] }) {
  const scores = computeDomainScores(results);
  const days   = results.find(r => r.taskId === "days_of_week")?.metrics  as DaysMetrics    | undefined;
  const ddk    = results.find(r => r.taskId === "ddk")?.metrics           as DDKMetrics     | undefined;
  const pic    = results.find(r => r.taskId === "picture_description")?.metrics as PictureMetrics | undefined;
  const ic     = scoreColor(scores.novaIndex);
  const { hasNlp } = scores;

  const domains = [
    {
      label: "Articulation",
      score: scores.articulation,
      color: "#7c3aed",
      sub: [
        days && { key: "Word accuracy",   val: `${days.wordAccuracy.toFixed(1)}%` },
        days && { key: "Phoneme accuracy", val: `${days.phonemeAccuracy.toFixed(1)}%` },
        ddk  && { key: "DDK clean rate",  val: `${ddk.cleanRatePct.toFixed(0)}%` },
        (pic?.vsaHz2 != null) && { key: "VSA", val: `${(pic.vsaHz2! / 1000).toFixed(0)}k Hz²` },
      ].filter(Boolean) as { key: string; val: string }[],
    },
    {
      label: "Fluency",
      score: scores.fluency,
      color: "#10b981",
      sub: [
        ddk && { key: "DDK rate",   val: `${ddk.overallDdkRateCps.toFixed(1)} cps` },
        ddk && { key: "IOI CV",     val: ddk.ioiCv.toFixed(2) },
        pic && { key: "Speech rate", val: `${pic.speechRate.toFixed(1)} syl/s` },
        pic && { key: "Pause rate", val: `${pic.pauseRate.toFixed(1)} /min` },
      ].filter(Boolean) as { key: string; val: string }[],
    },
    {
      label: "Language",
      score: scores.language,
      color: "#3b82f6",
      noData: !hasNlp,
      sub: [
        (pic?.msttr          != null) && { key: "Lexical diversity (MSTTR)", val: pic.msttr!.toFixed(2) },
        (pic?.lexicalDensity != null) && { key: "Lexical density",           val: `${pic.lexicalDensity}%` },
        (pic?.verbRatio      != null) && { key: "Verb ratio",                val: `${pic.verbRatio}%` },
        (pic?.meanSentenceLength != null) && { key: "Mean sentence length",  val: `${pic.meanSentenceLength} words` },
      ].filter(Boolean) as { key: string; val: string }[],
    },
    {
      label: "Intelligibility",
      score: scores.intelligibility,
      color: "#14b8a6",
      sub: [
        pic && { key: "Intelligibility", val: `${pic.intelligibilityScore.toFixed(1)}%` },
        pic && { key: "Naturalness",     val: `${pic.naturalnessScore.toFixed(1)}%` },
      ].filter(Boolean) as { key: string; val: string }[],
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* NOVA Speech Index banner */}
      <div style={{
        background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
        borderRadius: 16, padding: "1.25rem 1.5rem",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        flexWrap: "wrap",
      }}>
        <div>
          <p style={{ margin: 0, fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.1em", color: "#a5b4fc" }}>NOVA Speech Index</p>
          <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#c7d2fe" }}>
            {severity(scores.novaIndex)}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: "3rem", fontWeight: 900, color: ic, lineHeight: 1 }}>
            {scores.novaIndex}
          </span>
          <span style={{ fontSize: "1.1rem", color: "#a5b4fc", fontWeight: 600 }}>/100</span>
        </div>

        {/* Wide progress bar */}
        <div style={{ width: "100%", height: 8, borderRadius: 99,
          background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${scores.novaIndex}%`,
            borderRadius: 99, background: ic, transition: "width 0.8s ease" }} />
        </div>

        {/* Domain score pills */}
        <div style={{ width: "100%", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {domains.map(d => (
            <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 5,
              background: "rgba(255,255,255,0.08)", borderRadius: 99,
              padding: "3px 10px", opacity: d.noData ? 0.5 : 1 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%",
                background: d.noData ? "#64748b" : scoreColor(d.score) }} />
              <span style={{ fontSize: "0.68rem", color: "#c7d2fe", fontWeight: 600 }}>{d.label}</span>
              <span style={{ fontSize: "0.72rem", color: d.noData ? "#94a3b8" : scoreColor(d.score), fontWeight: 800 }}>
                {d.noData ? "—" : d.score}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 4 domain cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {domains.map(d => (
          <DomainCard key={d.label} label={d.label} score={d.score} color={d.color} sub={d.sub} noData={d.noData} />
        ))}
      </div>

      {/* Normative footnote */}
      <p style={{ margin: 0, fontSize: "0.62rem", color: "#9ca3af", textAlign: "right" }}>
        Scores normalised against published clinical norms for healthy adults.
        {hasNlp
          ? " Weights: Articulation 30% · Fluency 25% · Language 20% · Intelligibility 25%."
          : " Weights (no transcript): Articulation 37.5% · Fluency 31.25% · Intelligibility 31.25%. Language requires picture description transcript."
        }
      </p>
    </div>
  );
}
