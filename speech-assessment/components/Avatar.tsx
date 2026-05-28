"use client";

export type AvatarState = "idle" | "speaking" | "listening" | "processing" | "completed";

interface AvatarProps {
  state?: AvatarState;
  size?: number;
  stream?: MediaStream | null;
  taskPage?: boolean; // suppresses bounce when idle/completed
}

// Bell-curve bar heights — mimic a speech spectrogram
const BARS = [
  { hu: 5,  hl: 2  },
  { hu: 9,  hl: 4  },
  { hu: 14, hl: 6  },
  { hu: 19, hl: 9  },
  { hu: 24, hl: 11 },
  { hu: 28, hl: 13 },
  { hu: 30, hl: 14 },
  { hu: 30, hl: 14 },
  { hu: 28, hl: 13 },
  { hu: 24, hl: 11 },
  { hu: 19, hl: 9  },
  { hu: 14, hl: 6  },
  { hu: 9,  hl: 4  },
  { hu: 5,  hl: 2  },
];

const SPARKLES = [
  { cx: 0.13, cy: 0.18 },
  { cx: 0.84, cy: 0.15 },
  { cx: 0.08, cy: 0.58 },
  { cx: 0.90, cy: 0.62 },
  { cx: 0.50, cy: 0.07 },
  { cx: 0.78, cy: 0.84 },
];

export default function Avatar({ state = "idle", size = 160, taskPage = false }: AvatarProps) {
  const SVG_W   = size;
  const SVG_H   = size;
  const EQ_Y    = SVG_H * 0.51;
  const BAR_W   = size * 0.032;
  const BAR_GAP = size * 0.016;
  const STEP    = BAR_W + BAR_GAP;
  const TOTAL_W = BARS.length * BAR_W + (BARS.length - 1) * BAR_GAP;
  const START_X = (SVG_W - TOTAL_W) / 2;
  const SCALE   = size / 190; // relative to landing globe reference size

  return (
    // State wrapper — CSS in globals.css drives all animations per state
    <div className={`nova-state-${state}${taskPage ? " nova-task" : ""}`} style={{ position: "relative", display: "inline-flex" }}>
      <div className="nova-wrap" style={{ width: size, height: size }}>
        <div className="nova-aura-outer" style={{ width: size * 1.79, height: size * 1.79 }} />
        <div className="nova-aura"       style={{ width: size * 1.42, height: size * 1.42 }} />

        {/* Processing rings */}
        <div className="nova-ring1" style={{
          display: "none", position: "absolute",
          width: size * 1.16, height: size * 1.16, borderRadius: "50%",
          border: `2px solid rgba(167,139,250,0.15)`,
          borderTopColor: "rgba(167,139,250,0.85)",
          borderRightColor: "rgba(167,139,250,0.4)",
          pointerEvents: "none",
        }} />
        <div className="nova-ring2" style={{
          display: "none", position: "absolute",
          width: size * 1.08, height: size * 1.08, borderRadius: "50%",
          border: `1.5px solid rgba(139,92,246,0.10)`,
          borderBottomColor: "rgba(139,92,246,0.6)",
          pointerEvents: "none",
        }} />

        <div className="nova-sphere" style={{ width: size, height: size }}>
          <div className="nova-shine" style={{
            top: "6%", left: "9%", width: "40%", height: "32%",
          }} />
          <div className="nova-ring" />

          <svg
            width={SVG_W} height={SVG_H}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            style={{ position: "relative", zIndex: 1, overflow: "visible" }}
          >
            <defs>
              <linearGradient id={`avgu${size}`} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%"   stopColor="rgba(196,181,253,0.90)" />
                <stop offset="55%"  stopColor="rgba(237,233,254,0.97)" />
                <stop offset="100%" stopColor="rgba(255,255,255,1)"    />
              </linearGradient>
              <linearGradient id={`avgl${size}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="rgba(196,181,253,0.80)" />
                <stop offset="100%" stopColor="rgba(109,40,217,0.15)"  />
              </linearGradient>
            </defs>

            {/* Equator arc */}
            <path
              d={`M ${START_X} ${EQ_Y} Q ${SVG_W/2} ${EQ_Y + SVG_H*0.055} ${START_X + TOTAL_W} ${EQ_Y}`}
              stroke="rgba(216,180,254,0.60)" strokeWidth={Math.max(1, SCALE * 1.5)}
              fill="none" strokeLinecap="round"
            />

            {/* Upper bars */}
            {BARS.map((bar, i) => {
              const bx = START_X + i * STEP;
              const bh = bar.hu * SCALE;
              return (
                <rect
                  key={`u${i}`}
                  className={`nova-bar-u nova-b${i}`}
                  x={bx} y={EQ_Y - bh}
                  width={BAR_W} height={bh} rx={BAR_W / 2}
                  fill={`url(#avgu${size})`}
                />
              );
            })}

            {/* Lower bars */}
            {BARS.map((bar, i) => {
              const bx = START_X + i * STEP;
              const bh = bar.hl * SCALE;
              return (
                <rect
                  key={`l${i}`}
                  className={`nova-bar-l nova-b${i}`}
                  x={bx} y={EQ_Y + 1}
                  width={BAR_W} height={bh} rx={BAR_W / 3}
                  fill={`url(#avgl${size})`}
                />
              );
            })}

            {/* Sparkles */}
            {SPARKLES.map((s, i) => (
              <circle
                key={`sp${i}`}
                className={`nova-sp${i}`}
                cx={s.cx * SVG_W} cy={s.cy * SVG_H}
                r={Math.max(1, SCALE * 1.6)}
                fill="rgba(221,214,254,0.92)"
              />
            ))}
          </svg>
        </div>

        {/* Floor shadow */}
        <div style={{
          position: "absolute", bottom: -(size * 0.05),
          left: "15%", right: "15%", height: size * 0.05,
          background: "rgba(88,28,135,0.18)", borderRadius: "50%",
          filter: "blur(8px)", pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}
