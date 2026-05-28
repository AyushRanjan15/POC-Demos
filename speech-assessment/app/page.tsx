"use client";
// V1.1 — NOVA branding, Redenlab palette: #633269 · #003d20 · #003941
// Client component so we can unlock AudioContext on button gesture before
// navigating, enabling auto-play on the assessment page (iOS requirement).

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { speak, unlockAudio } from "@/lib/tts";
import { getIdToken, handleAuthCallback, isAuthConfigured, redirectToLogin } from "@/lib/auth";
import { isApiConfigured } from "@/lib/inferenceClient";

export default function HomePage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(!isApiConfigured());

  useEffect(() => {
    if (!isApiConfigured()) return;

    let mounted = true;
    async function initAuth() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");

      if (!isAuthConfigured()) {
        throw new Error("Missing auth config: NEXT_PUBLIC_COGNITO_DOMAIN / NEXT_PUBLIC_COGNITO_CLIENT_ID");
      }

      if (code) {
        await handleAuthCallback(code, state);
      } else if (!getIdToken()) {
        await redirectToLogin(window.location.pathname + window.location.search);
        return;
      }

      if (mounted) setAuthReady(true);
    }

    initAuth().catch((err) => {
      const message = err instanceof Error ? err.message : "Authentication initialization failed";
      console.error("[home/init] error:", message);
      if (mounted) setAuthReady(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const BARS = [
    { hu: 6,  hl: 3  },
    { hu: 11, hl: 5  },
    { hu: 17, hl: 8  },
    { hu: 23, hl: 11 },
    { hu: 29, hl: 14 },
    { hu: 34, hl: 16 },
    { hu: 37, hl: 18 },
    { hu: 37, hl: 18 },
    { hu: 34, hl: 16 },
    { hu: 29, hl: 14 },
    { hu: 23, hl: 11 },
    { hu: 17, hl: 8  },
    { hu: 11, hl: 5  },
    { hu: 6,  hl: 3  },
  ];

  const BAR_W   = 5;
  const BAR_GAP = 2.8;
  const EQ_Y    = 63;
  const SVG_W   = 124;
  const STEP    = BAR_W + BAR_GAP;
  const TOTAL_W = BARS.length * BAR_W + (BARS.length - 1) * BAR_GAP;
  const START_X = (SVG_W - TOTAL_W) / 2;

  const SPARKLES = [
    { cx: 16,  cy: 22,  fill: "rgba(178,153,179,0.90)" },
    { cx: 104, cy: 18,  fill: "rgba(141,179,146,0.85)" },
    { cx: 10,  cy: 72,  fill: "rgba(178,153,179,0.80)" },
    { cx: 112, cy: 76,  fill: "rgba(141,179,146,0.80)" },
    { cx: 62,  cy: 8,   fill: "rgba(178,153,179,0.90)" },
    { cx: 96,  cy: 104, fill: "rgba(141,179,146,0.75)" },
  ];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const participantId = (form.elements.namedItem("participantId") as HTMLInputElement).value.trim();
    const sessionId     = (form.elements.namedItem("sessionId")     as HTMLInputElement).value.trim();
    if (!participantId || !sessionId) return;

    const introText = "Hello! I'm Nova, your assessment guide. Today we'll complete 3 short speech tasks together. Speak naturally — there are no right or wrong answers.";

    // Unlock AudioContext synchronously during this gesture, and preload buffer.
    unlockAudio();

    // Await speak() so currentSource is guaranteed set before we navigate.
    // isSpeaking() on the assessment page will then return true, letting it
    // attach its avatar callback without stopping and restarting (no gesture needed).
    await speak(introText, () => {}).catch(() => {});

    router.push(
      `/assessment?participantId=${encodeURIComponent(participantId)}&sessionId=${encodeURIComponent(sessionId)}`
    );
  }

  if (!authReady) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f3ff" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid #e9d5ff", borderTopColor: "#7c3aed", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </main>
    );
  }

  return (
    <main style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "3rem 1rem",
      background: "radial-gradient(ellipse at 50% 0%, rgba(109,40,217,0.16) 0%, transparent 60%), #f5f3ff",
      paddingTop: "1rem", paddingBottom: "1rem",
    }}>

      {/* ── NOVA Hero ── */}
      <div style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", textAlign: "center",
        gap: "0.8rem", marginBottom: "1.2rem",
      }}>

        {/* NOVA Globe — 150px on landing for compactness */}
        <div className="nova-wrap" style={{ margin: "0 auto", width: 150, height: 150 }}>
          <div className="nova-aura-outer" style={{ width: 270, height: 270 }} />
          <div className="nova-aura"       style={{ width: 213, height: 213 }} />
          <div className="nova-sphere" style={{ width: 150, height: 150 }}>
            <div className="nova-shine" />
            <div className="nova-ring" />

            <svg
              width={SVG_W} height="124"
              viewBox={`0 0 ${SVG_W} 124`}
              style={{ position: "relative", zIndex: 1, overflow: "visible" }}
            >
              <defs>
                {/* Upper bars: #b299b3 (Redenlab light purple) → white */}
                <linearGradient id="nbgu" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%"   stopColor="rgba(178,153,179,0.90)" />
                  <stop offset="50%"  stopColor="rgba(220,210,222,0.96)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,1)"    />
                </linearGradient>
                {/* Lower bars: #8db392 (Redenlab green) → forest fade */}
                <linearGradient id="nbgl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="rgba(141,179,146,0.85)" />
                  <stop offset="100%" stopColor="rgba(0,61,32,0.20)"     />
                </linearGradient>
              </defs>

              {/* Equator arc */}
              <path
                d={`M 4 ${EQ_Y} Q ${SVG_W / 2} ${EQ_Y + 7} ${SVG_W - 4} ${EQ_Y}`}
                stroke="rgba(178,153,179,0.55)" strokeWidth="1.5" fill="none" strokeLinecap="round"
              />
              <path
                d={`M 4 ${EQ_Y} Q ${SVG_W / 2} ${EQ_Y + 7} ${SVG_W - 4} ${EQ_Y}`}
                stroke="rgba(255,255,255,0.12)" strokeWidth="0.6" fill="none" strokeLinecap="round"
              />

              {/* Upper bars */}
              {BARS.map((bar, i) => {
                const bx = START_X + i * STEP;
                return (
                  <rect
                    key={`u${i}`}
                    className={`nova-bar-u nova-b${i}`}
                    x={bx} y={EQ_Y - bar.hu}
                    width={BAR_W} height={bar.hu} rx={1.5}
                    fill="url(#nbgu)"
                  />
                );
              })}

              {/* Lower bars */}
              {BARS.map((bar, i) => {
                const bx = START_X + i * STEP;
                return (
                  <rect
                    key={`l${i}`}
                    className={`nova-bar-l nova-b${i}`}
                    x={bx} y={EQ_Y + 1}
                    width={BAR_W} height={bar.hl} rx={1}
                    fill="url(#nbgl)"
                  />
                );
              })}

              {/* Sparkles — alternating purple/green */}
              {SPARKLES.map((s, i) => (
                <circle
                  key={`sp${i}`}
                  className={`nova-sp${i}`}
                  cx={s.cx} cy={s.cy} r={1.6}
                  fill={s.fill}
                />
              ))}
            </svg>
          </div>
        </div>

        {/* NOVA wordmark */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <h1 style={{
            fontSize: "3.2rem", fontWeight: 900,
            letterSpacing: "0.20em",
            margin: "0 -0.20em 0 0", lineHeight: 1,
            color: "#ffffff",
            textShadow: "0 0 30px rgba(167,139,250,0.90), 0 0 70px rgba(109,40,217,0.55), 0 2px 6px rgba(0,0,0,0.18)",
          }}>
            NOVA
          </h1>
          <p style={{
            fontSize: "0.76rem", fontWeight: 500,
            letterSpacing: "0.05em",
            color: "#7c3aed", fontStyle: "italic",
            margin: "2px 0 0",
          }}>
            Care Begins with Listening
          </p>
          <p style={{
            fontSize: "0.65rem", color: "#94a3b8",
            letterSpacing: "0.03em",
            margin: "3px 0 0",
          }}>
            Powered by <strong style={{ fontWeight: 600, color: "#94a3b8" }}>&#x222B;ntelligense</strong>
            <span style={{ fontWeight: 400 }}> · Redenlab</span>
          </p>
        </div>
      </div>

      {/* ── Start form ── */}
      <div style={{
        width: "100%", maxWidth: 360, background: "#fff",
        borderRadius: "1.5rem",
        boxShadow: "0 20px 60px rgba(0,0,0,0.09), 0 1px 2px rgba(0,0,0,0.05)",
        border: "1px solid #ede9fe", padding: "1.25rem",
      }}>
        <p style={{ fontSize: "0.88rem", fontWeight: 600, color: "#1e293b", margin: "0 0 0.9rem" }}>
          Start New Assessment Session
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {[
            { id: "participantId", label: "Participant ID", placeholder: "e.g. P001" },
            { id: "sessionId",    label: "Session ID",    placeholder: "e.g. S001" },
          ].map(({ id, label, placeholder }) => (
            <div key={id}>
              <label htmlFor={id} style={{ display: "block", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", marginBottom: "0.4rem" }}>
                {label}
              </label>
              <input
                id={id} name={id} type="text" required placeholder={placeholder}
                style={{ width: "100%", padding: "0.75rem 1rem", borderRadius: "0.75rem", border: "1.5px solid #e2e8f0", fontSize: "0.95rem", color: "#0f172a", background: "#fff", boxSizing: "border-box", outline: "none", WebkitAppearance: "none" }}
              />
            </div>
          ))}

          <button type="submit" style={{
            width: "100%", padding: "1rem", borderRadius: "0.75rem", border: "none",
            background: "linear-gradient(135deg, #6d28d9, #a855f7)",
            color: "#fff", fontSize: "1rem", fontWeight: 700, cursor: "pointer", marginTop: "0.25rem",
          }}>
            Begin Assessment →
          </button>
        </form>

        <p style={{ marginTop: "0.75rem", textAlign: "center", fontSize: "0.68rem", color: "#94a3b8" }}>
          Recordings are processed securely and tagged per session.
        </p>
      </div>

      <p style={{ marginTop: "0.9rem", fontSize: "0.65rem", color: "#94a3b8" }}>
        © {new Date().getFullYear()} Redenlab — NOVA v1.1
      </p>
    </main>
  );
}
