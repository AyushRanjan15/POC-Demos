"use client";

import { useEffect, useState, useRef } from "react";
import { SessionResults, DaysMetrics, DDKMetrics, PictureMetrics, TaskResult } from "@/types";
import { DaysCharts, DDKCharts, PictureCharts } from "@/components/charts/MetricsChart";
import { DomainSummary, computeDomainScores } from "@/components/charts/DomainSummary";

const TASK_LABELS: Record<string, string> = {
  days_of_week:       "Days of the Week",
  ddk:                "DDK — Syllable Repetition",
  picture_description: "Picture Description",
};

// ── Metric glossary data ───────────────────────────────────────────────────────
const GLOSSARY: {
  title: string; color: string;
  metrics: { name: string; abbr?: string; meaning: string }[];
}[] = [
  {
    title: "Days of the Week", color: "#7c3aed",
    metrics: [
      { name: "Word Error Rate", abbr: "WER", meaning: "Proportion of words incorrectly transcribed. Values below 10% are generally within normal limits." },
      { name: "Phoneme Error Rate", abbr: "PER", meaning: "Proportion of individual speech sounds mispronounced. Sensitive to subtle articulation errors even when words are broadly intelligible." },
      { name: "Word Accuracy", meaning: "Percentage of words spoken correctly (100% − WER). A score above 90% is considered functionally normal for most clinical purposes." },
      { name: "Phoneme Accuracy", meaning: "Percentage of phonemes produced correctly. Reflects articulatory precision at the sub-word level and can reveal errors masked at the word level." },
    ],
  },
  {
    title: "DDK — Syllable Repetition", color: "#10b981",
    metrics: [
      { name: "Attempts", abbr: "n_attempts", meaning: "Total number of PA-TA-KA syllable repetitions produced across the task. A low count may reflect fatigue, hesitation, or reduced motor drive." },
      { name: "Clean Syllables", abbr: "n_clean", meaning: "Repetitions whose Phoneme Error Rate falls at or below the clean threshold — these are considered well-formed productions." },
      { name: "Clean Rate", abbr: "clean_rate_pct", meaning: "Fraction of attempts that were well-formed. Higher values indicate more consistent articulatory execution." },
      { name: "Best PER", abbr: "best_per", meaning: "The lowest (best) phoneme error rate achieved in any single attempt. A value of 0% confirms the patient can produce at least one perfect PA-TA-KA sequence." },
      { name: "Mean PER — All", abbr: "mean_per_all", meaning: "Average phoneme error rate across all repetitions, including poorly formed ones. Reflects overall articulatory accuracy without filtering." },
      { name: "Mean PER — Clean", abbr: "mean_per_clean", meaning: "Average PER restricted to well-formed attempts only. Represents the patient's best sustained accuracy when execution is consistent." },
      { name: "DDK Rate — Overall", abbr: "overall_ddk_rate_cps", meaning: "Diadochokinetic rate: total syllables ÷ task duration (cycles per second). Clinical norm is approximately 6 cps for PA-TA-KA in healthy adults." },
      { name: "DDK Rate — Best Clean", abbr: "best_clean_ddk_rate_cps", meaning: "Rate during the patient's best run of consecutive clean repetitions. Less influenced by error bursts or inter-sequence pauses." },
      { name: "IOI Mean", abbr: "ioi_mean_s", meaning: "Inter-onset interval: average time (seconds) between successive syllable onsets in clean attempts. Shorter intervals indicate faster speech motor execution." },
      { name: "IOI CV", abbr: "ioi_cv", meaning: "Coefficient of variation of the IOI. A value near 0 indicates highly regular, metronomic timing; higher values reflect temporal variability or motor instability." },
      { name: "Phoneme Accuracy by Position", abbr: "phoneme_accuracy_by_pos", meaning: "Per-phoneme accuracy across the six positions of PA-TA-KA [P, A, T, A, K, A]. Identifies which specific sounds break down; position 5 (K) is typically the most demanding articulatorily." },
    ],
  },
  {
    title: "Picture Description — Acoustics", color: "#3b82f6",
    metrics: [
      { name: "Intelligibility Score", meaning: "Estimated proportion of speech that a naïve listener can understand. Scores above 90% are generally within functional communication range for everyday interaction." },
      { name: "Naturalness Score", meaning: "Perceptual measure of how natural and fluent the speech sounds, accounting for prosody, rate consistency, and voice quality. Sensitive to dysarthric or dysprosodic patterns." },
      { name: "Speech Rate", abbr: "syl/s", meaning: "Syllables produced per second during active speech segments (pauses excluded). The typical conversational range is 3–6 syllables/second; values outside this range may indicate motor or respiratory involvement." },
      { name: "Pause Rate", abbr: "/min", meaning: "Number of pauses per minute of speech. Elevated pause rates may reflect word-finding difficulty, reduced respiratory support, or speech motor planning deficits." },
      { name: "Vowel Space Area", abbr: "VSA (Hz²)", meaning: "Area of the convex hull enclosing the median F1/F2 formant positions of each vowel type. A larger VSA reflects greater acoustic contrast between vowels; reduced VSA is associated with hypokinetic or dysarthric speech where vowels converge toward a centralised position." },
    ],
  },
  {
    title: "Picture Description — Language", color: "#8b5cf6",
    metrics: [
      { name: "Noun Ratio", abbr: "noun%", meaning: "Percentage of all spoken words that are nouns. Reduced noun ratio may reflect anomia (word-finding difficulty) common in aphasia and early dementia." },
      { name: "Verb Ratio", abbr: "verb%", meaning: "Percentage of words that are verbs. Low verb ratio is associated with agrammatism in Broca's aphasia; clinical norms are approximately 15–20% for picture description." },
      { name: "Adj / Adv Ratio", abbr: "adj+adv%", meaning: "Combined proportion of adjectives and adverbs, reflecting descriptive elaboration. Reduced values may indicate impoverished propositional content." },
      { name: "Lexical Density", meaning: "Proportion of content words (nouns, verbs, adjectives, adverbs) to total words. Typical spontaneous speech is 45–60%. Values below 40% suggest heavy reliance on grammatical function words with limited informational content." },
      { name: "Lexical Diversity (MSTTR)", abbr: "MSTTR", meaning: "Moving-window Type-Token Ratio — proportion of unique words in successive 50-word windows. Values near 0.70 are typical for healthy adults; lower values indicate repetitive or restricted vocabulary, seen in semantic dementia and some aphasia types." },
      { name: "Mean Sentence Length", meaning: "Average number of words per sentence. Shorter mean sentence length can reflect simplified syntax or fragmented utterances associated with motor speech or cognitive-linguistic impairment." },
      { name: "Filler Word Rate", abbr: "/min", meaning: "Rate of filler words (um, uh, like, so) per minute. Elevated filler rates reflect word-finding pauses and are sensitive to early language impairment, anxiety, or reduced processing speed." },
    ],
  },
];

// ── Fetch image as base64 data-URL ────────────────────────────────────────────
async function fetchDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ── Capture a DOM element as PNG for PDF ──────────────────────────────────────
async function captureEl(el: HTMLElement, h2c: typeof import("html2canvas")["default"]) {
  try {
    const orig = el.style.width;
    el.style.width = "680px";
    await new Promise(r => requestAnimationFrame(r));
    const canvas = await h2c(el, { scale: 3, useCORS: true, backgroundColor: "#ffffff", logging: false, width: 680 });
    el.style.width = orig;
    return { data: canvas.toDataURL("image/png"), w: canvas.width, h: canvas.height };
  } catch { return null; }
}

export default function ResultsPage() {
  const [results,      setResults]      = useState<SessionResults | null>(null);
  const [exporting,    setExporting]    = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  // One ref per task chart section + domain summary
  const daysRef    = useRef<HTMLDivElement>(null);
  const ddkRef     = useRef<HTMLDivElement>(null);
  const pictureRef = useRef<HTMLDivElement>(null);
  const domainRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("speechAssessmentResults");
    if (!raw) { window.location.href = "/"; return; }
    setResults(JSON.parse(raw));
  }, []);

  if (!results) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e9d5ff", borderTopColor: "#7c3aed", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const { session, taskResults, completedAt } = results;

  // Type-safe metric getters
  const days    = taskResults.find(r => r.taskId === "days_of_week");
  const ddk     = taskResults.find(r => r.taskId === "ddk");
  const picture = taskResults.find(r => r.taskId === "picture_description");

  // ── PDF Export ──────────────────────────────────────────────────────────────
  async function handleExportPDF() {
    setExporting(true);
    try {
      const { jsPDF }   = await import("jspdf");
      const html2canvas = (await import("html2canvas")).default;

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const PW = 210, PH = 297, M = 16, CW = PW - M * 2;
      const FOOTER_H = 18;
      const HEADER_H = 42.03;

      const [headerUrl, footerUrl] = await Promise.all([
        fetchDataUrl("/images/PDF_Header.jpg"),
        fetchDataUrl("/images/PDF_Footer.jpg"),
      ]);

      function drawHeader(): number {
        if (headerUrl) doc.addImage(headerUrl, "JPEG", 0, 0, PW, HEADER_H);
        else {
          doc.setFillColor(72, 30, 140); doc.rect(0, 0, PW, HEADER_H, "F");
          doc.setFont("helvetica","bold"); doc.setFontSize(18); doc.setTextColor(255,255,255);
          doc.text("NOVA", PW/2, HEADER_H/2+3, { align: "center" });
        }
        return HEADER_H + 5;
      }

      function drawFooter(pageNum: number, totalPages: number) {
        const fY = PH - FOOTER_H;
        if (footerUrl) doc.addImage(footerUrl, "JPEG", 0, fY, PW, FOOTER_H);
        else { doc.setFillColor(72,30,140); doc.rect(0, fY, PW, FOOTER_H, "F"); }
        doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(255,255,255);
        doc.text(`${pageNum} / ${totalPages}`, PW/2, fY + FOOTER_H/2 + 1, { align: "center" });
      }

      function sectionTitle(text: string, y: number): number {
        doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(17,24,39);
        doc.text(text, M, y);
        doc.setDrawColor(109,40,217); doc.setLineWidth(0.7);
        doc.line(M, y+2, M+doc.getTextWidth(text), y+2);
        return y + 9;
      }

      let pageNum = 1;
      function maybeNewPage(y: number, needed: number): number {
        if (y + needed > PH - FOOTER_H - 4) {
          doc.addPage(); pageNum++;
          return drawHeader();
        }
        return y;
      }

      // ── PAGE 1: Session info + summary table ─────────────────────────────
      let y = drawHeader();
      doc.setFont("helvetica","bold"); doc.setFontSize(15); doc.setTextColor(17,24,39);
      doc.text("Speech Assessment Report", M, y); y += 5;
      doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(107,114,128);
      doc.text(`Generated: ${new Date(completedAt).toLocaleString("en-AU",{dateStyle:"long",timeStyle:"short"})}`, M, y);
      y += 5;
      doc.setDrawColor(229,231,235); doc.setLineWidth(0.4);
      doc.line(M, y, PW-M, y); y += 5;

      // Session info box
      const info: [string,string][] = [
        ["PARTICIPANT", session.participantId],
        ["SESSION",     session.sessionId],
        ["DATE",        new Date(session.startTime).toLocaleDateString("en-AU",{dateStyle:"medium"})],
        ["TASKS",       `${taskResults.length} completed`],
      ];
      const colW = CW / info.length;
      doc.setFillColor(248,246,255); doc.setDrawColor(209,196,233); doc.setLineWidth(0.3);
      doc.roundedRect(M, y, CW, 22, 3, 3, "FD");
      info.forEach(([label,value],i) => {
        const x = M + 5 + i * colW;
        doc.setFont("helvetica","bold"); doc.setFontSize(6); doc.setTextColor(109,40,217); doc.text(label, x, y+7);
        doc.setFontSize(10); doc.setTextColor(17,24,39); doc.text(value, x, y+17);
      });
      y += 22 + 10;

      // ── Overall performance summary (visual capture) ──────────────────────
      if (domainRef.current) {
        const cap = await captureEl(domainRef.current, html2canvas);
        if (cap) {
          const h = (cap.h / cap.w) * CW;
          y = maybeNewPage(y, h + 4);
          doc.addImage(cap.data, "PNG", M, y, CW, h);
          y += h + 8;
        }
      }

      // ── Task sections ─────────────────────────────────────────────────────
      const taskSections: { label: string; ref: React.RefObject<HTMLDivElement | null>; rows?: string[][] }[] = [
        {
          label: "Days of the Week",
          ref: daysRef,
          rows: days ? (() => {
            const m = days.metrics as DaysMetrics;
            return [
              ["Word Error Rate", `${(m.wer*100).toFixed(1)}%`, "Phoneme Error Rate", `${(m.phonemeErrorRate*100).toFixed(1)}%`],
              ["Word Accuracy",   `${m.wordAccuracy.toFixed(1)}%`, "Phoneme Accuracy", `${m.phonemeAccuracy.toFixed(1)}%`],
            ];
          })() : [],
        },
        {
          label: "DDK — Syllable Repetition",
          ref: ddkRef,
          rows: ddk ? (() => {
            const m = ddk.metrics as DDKMetrics;
            return [
              ["Attempts", String(m.nAttempts), "Clean Syllables", String(m.nClean)],
              ["Clean Rate", `${m.cleanRatePct.toFixed(1)}%`, "IOI Mean", `${m.ioiMeanS.toFixed(2)}s`],
              ["DDK Rate (overall)", `${m.overallDdkRateCps.toFixed(2)} cps`, "DDK Rate (best clean)", `${m.bestCleanDdkRateCps.toFixed(2)} cps`],
              ["Mean PER (all)", `${(m.meanPerAll*100).toFixed(1)}%`, "Mean PER (clean)", `${(m.meanPerClean*100).toFixed(1)}%`],
              ["IOI CV", `${m.ioiCv.toFixed(2)}`, "Best PER", `${(m.bestPer*100).toFixed(1)}%`],
            ];
          })() : [],
        },
        {
          label: "Picture Description",
          ref: pictureRef,
          rows: picture ? (() => {
            const m = picture.metrics as PictureMetrics;
            const rows: string[][] = [
              ["Intelligibility", `${m.intelligibilityScore.toFixed(1)}%`, "Naturalness", `${m.naturalnessScore.toFixed(1)}%`],
              ["Speech Rate", `${m.speechRate.toFixed(2)} syl/s`, "Pause Rate", `${m.pauseRate.toFixed(1)} /min`],
            ];
            if (m.vsaHz2 != null) rows.push(["Vowel Space Area", `${m.vsaHz2.toLocaleString()} Hz²`, "Vowel Types", String(m.nVowelTypes ?? "—")]);
            if (m.msttr != null) rows.push(["MSTTR", String(m.msttr), "Lexical Density", `${m.lexicalDensity}%`]);
            if (m.nounRatio != null) rows.push(["Noun Ratio", `${m.nounRatio}%`, "Verb Ratio", `${m.verbRatio}%`]);
            if (m.meanSentenceLength != null) rows.push(["Mean Sentence Length", `${m.meanSentenceLength} words`, "Filler Rate", `${m.fillerWordRate} /min`]);
            return rows;
          })() : [],
        },
      ];

      for (const { label, ref, rows } of taskSections) {
        doc.addPage(); pageNum++;
        y = drawHeader();
        y = sectionTitle(label, y);

        // Metrics table
        if (rows && rows.length > 0) {
          const hw = CW / 4;
          rows.forEach((row, ri) => {
            const even = ri % 2 === 0;
            doc.setFillColor(even ? 255 : 248, even ? 255 : 246, even ? 255 : 255);
            doc.rect(M, y, CW, 7, "F");
            doc.setDrawColor(237,233,254); doc.setLineWidth(0.15);
            doc.line(M, y+7, M+CW, y+7);
            row.forEach((cell, ci) => {
              const isVal = ci % 2 === 1;
              doc.setFont("helvetica", isVal ? "bold" : "normal");
              doc.setFontSize(7.5);
              doc.setTextColor(isVal ? 109 : 55, isVal ? 40 : 65, isVal ? 217 : 81);
              doc.text(cell, M + 4 + ci * hw, y + 4.8);
            });
            y += 7;
          });
          y += 5;
        }

        // Chart image
        if (ref.current) {
          const cap = await captureEl(ref.current, html2canvas);
          if (cap) {
            const h = (cap.h / cap.w) * CW;
            y = maybeNewPage(y, h + 4);
            doc.setFillColor(255,255,255); doc.setDrawColor(229,231,235); doc.setLineWidth(0.3);
            doc.roundedRect(M, y, CW, h, 3, 3, "FD");
            doc.addImage(cap.data, "PNG", M, y, CW, h);
            y += h + 8;
          }
        }
      }

      // ── Understanding Your Speech Metrics ────────────────────────────────
      doc.addPage(); pageNum++;
      y = drawHeader();
      doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(17,24,39);
      doc.text("Understanding Your Speech Metrics", M, y); y += 4;
      doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(107,114,128);
      doc.text("A clinician's reference for interpreting the acoustic measures in this report.", M, y); y += 6;
      doc.setDrawColor(229,231,235); doc.setLineWidth(0.4); doc.line(M, y, PW-M, y); y += 5;

      for (const section of GLOSSARY) {
        const rgb = section.color === "#7c3aed" ? [124,58,237] : section.color === "#10b981" ? [16,185,129] : [59,130,246];
        y = maybeNewPage(y, 14);
        // Section header pill
        doc.setFillColor(rgb[0], rgb[1], rgb[2]);
        doc.roundedRect(M, y, CW, 8, 2, 2, "F");
        doc.setFont("helvetica","bold"); doc.setFontSize(8.5); doc.setTextColor(255,255,255);
        doc.text(section.title, M+4, y+5.5); y += 10;

        for (let mi = 0; mi < section.metrics.length; mi++) {
          const m = section.metrics[mi];
          const rowH = 14;
          y = maybeNewPage(y, rowH + 2);
          const even = mi % 2 === 0;
          doc.setFillColor(even ? 250 : 255, even ? 249 : 255, even ? 255 : 255);
          doc.rect(M, y, CW, rowH, "F");
          doc.setDrawColor(237,233,254); doc.setLineWidth(0.1);
          doc.line(M, y+rowH, M+CW, y+rowH);

          // Metric name + abbr
          doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(rgb[0], rgb[1], rgb[2]);
          doc.text(m.name, M+3, y+5);
          if (m.abbr) {
            doc.setFont("helvetica","normal"); doc.setFontSize(6.5); doc.setTextColor(156,163,175);
            doc.text(`(${m.abbr})`, M+3, y+9.5);
          }
          // Clinical meaning — wrap within right 2/3 column
          const colL = CW * 0.36;
          doc.setFont("helvetica","normal"); doc.setFontSize(7.2); doc.setTextColor(55,65,81);
          const lines = doc.splitTextToSize(m.meaning, CW - colL - 4);
          doc.text(lines, M + colL, y + 4);
          y += rowH;
        }
        y += 4;
      }

      // ── Clinical note ─────────────────────────────────────────────────────
      y = maybeNewPage(y, 28);
      const noteLines = doc.splitTextToSize(
        "Clinical Note: These acoustic metrics are screening indicators only and do not constitute a diagnosis. Results must be interpreted by a qualified speech pathologist alongside a comprehensive clinical assessment.",
        CW - 10
      );
      const noteH = noteLines.length * 4.8 + 11;
      doc.setFillColor(250,245,255); doc.setDrawColor(209,196,233); doc.setLineWidth(0.4);
      doc.roundedRect(M, y, CW, noteH, 3, 3, "FD");
      doc.setFont("helvetica","bold"); doc.setFontSize(8.5); doc.setTextColor(109,40,217);
      doc.text("Clinical Note", M+5, y+7);
      doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(91,33,182);
      doc.text(noteLines, M+5, y+13);

      // Add footers to all pages
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p); drawFooter(p, totalPages);
      }

      doc.save(`${session.participantId}_${session.sessionId}_NOVA_report.pdf`);
    } finally {
      setExporting(false);
    }
  }

  // ── Screen render ──────────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: "#fff", borderRadius: 16, border: "1px solid #f1f5f9",
    padding: "1.25rem", boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
  };
  const tagStyle = (color: string): React.CSSProperties => ({
    display: "inline-block", padding: "2px 10px", borderRadius: 99,
    fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
    background: color + "18", color,
  });

  function TaskSection({ result, chartEl, idx }: { result: TaskResult; chartEl: React.ReactNode; idx: number }) {
    const colors = ["#7c3aed", "#10b981", "#3b82f6"];
    const c = colors[idx % colors.length];
    return (
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: c, color: "#fff", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{idx + 1}</div>
          <div>
            <p style={{ fontWeight: 700, color: "#111827", margin: 0 }}>{TASK_LABELS[result.taskId]}</p>
            <code style={{ fontSize: "0.68rem", color: "#9ca3af" }}>{result.filename}</code>
          </div>
          <span style={{ ...tagStyle(c), marginLeft: "auto" }}>Complete</span>
        </div>
        {chartEl}
      </div>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", padding: "1.5rem 1rem" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.1rem" }}>

        {/* Header bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#7c3aed,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13 }}>R</div>
            <span style={{ fontWeight: 600, color: "#374151" }}>Assessment Results</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={handleExportPDF} disabled={exporting}
              style={{ padding: "0.5rem 1rem", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: exporting ? "#9ca3af" : "#374151", fontSize: "0.8rem", fontWeight: 600, cursor: exporting ? "default" : "pointer" }}>
              {exporting ? "⏳ Generating…" : "↓ Export PDF"}
            </button>
            <button type="button" onClick={() => { sessionStorage.clear(); window.location.href = "/"; }}
              style={{ padding: "0.5rem 1rem", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" }}>
              New Session
            </button>
          </div>
        </div>

        {/* Session summary */}
        <div style={cardStyle}>
          <p style={{ fontWeight: 700, color: "#111827", margin: "0 0 10px", fontSize: "0.9rem" }}>✅ Session Complete</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {[["Participant",session.participantId],["Session",session.sessionId],["Tasks",String(taskResults.length)],
              ["Completed",new Date(completedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})]].map(([l,v])=>(
              <div key={l}>
                <p style={{ fontSize:"0.62rem",color:"#9ca3af",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",margin:0 }}>{l}</p>
                <p style={{ fontSize:"1rem",fontWeight:700,color:"#111827",margin:"2px 0 0" }}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Domain summary — replaces radar */}
        <div style={cardStyle} ref={domainRef}>
          <p style={{ fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Overall Performance Summary</p>
          <p style={{ fontSize: "0.75rem", color: "#9ca3af", margin: "0 0 12px" }}>
            Domain scores normalised to healthy adult norms
          </p>
          <DomainSummary results={taskResults} />
        </div>

        {/* Days of the Week */}
        {days && (
          <TaskSection result={days} idx={0} chartEl={
            <div ref={daysRef}>
              <DaysCharts metrics={days.metrics as DaysMetrics} />
            </div>
          } />
        )}

        {/* DDK */}
        {ddk && (
          <TaskSection result={ddk} idx={1} chartEl={
            <div ref={ddkRef}>
              <DDKCharts metrics={ddk.metrics as DDKMetrics} />
            </div>
          } />
        )}

        {/* Picture Description */}
        {picture && (
          <TaskSection result={picture} idx={2} chartEl={
            <div ref={pictureRef}>
              <PictureCharts metrics={picture.metrics as PictureMetrics} />
            </div>
          } />
        )}

        {/* Clinical note */}
        <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 14, padding: "1rem", fontSize: "0.8rem", color: "#6d28d9", lineHeight: 1.6 }}>
          <strong>Clinical Note:</strong> These metrics are acoustic screening indicators only. Results should be interpreted by a qualified clinician alongside a full clinical assessment.
        </div>

        {/* Understanding Your Speech Metrics */}
        <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
          <button
            type="button"
            onClick={() => setGlossaryOpen(o => !o)}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <div>
              <p style={{ fontWeight: 700, color: "#111827", margin: 0, fontSize: "0.95rem" }}>Understanding Your Speech Metrics</p>
              <p style={{ fontSize: "0.72rem", color: "#9ca3af", margin: "2px 0 0" }}>Clinical reference for interpreting each acoustic measure</p>
            </div>
            <span style={{ fontSize: "1rem", color: "#7c3aed", flexShrink: 0, marginLeft: 12 }}>{glossaryOpen ? "▲" : "▼"}</span>
          </button>

          {glossaryOpen && (
            <div style={{ padding: "0 1.25rem 1.25rem", display: "flex", flexDirection: "column", gap: 16 }}>
              {GLOSSARY.map(section => (
                <div key={section.title}>
                  {/* Section header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: section.color, flexShrink: 0 }} />
                    <p style={{ fontWeight: 700, color: section.color, margin: 0, fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>{section.title}</p>
                  </div>
                  {/* Metric rows */}
                  <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #f1f5f9" }}>
                    {section.metrics.map((m, i) => (
                      <div key={m.name} style={{ display: "grid", gridTemplateColumns: "200px 1fr", background: i % 2 === 0 ? "#faf9ff" : "#fff", borderBottom: i < section.metrics.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                        <div style={{ padding: "10px 12px", borderRight: "1px solid #f1f5f9" }}>
                          <p style={{ fontWeight: 700, color: section.color, margin: 0, fontSize: "0.78rem" }}>{m.name}</p>
                          {m.abbr && <code style={{ fontSize: "0.65rem", color: "#9ca3af" }}>{m.abbr}</code>}
                        </div>
                        <div style={{ padding: "10px 12px" }}>
                          <p style={{ margin: 0, fontSize: "0.76rem", color: "#374151", lineHeight: 1.55 }}>{m.meaning}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p style={{ textAlign:"center", fontSize:"0.65rem", color:"#9ca3af", paddingBottom:"1.5rem" }}>
          © {new Date().getFullYear()} Redenlab — NOVA v2.0
        </p>
      </div>
    </main>
  );
}
