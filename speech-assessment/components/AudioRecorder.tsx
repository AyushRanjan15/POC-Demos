"use client";

import { useEffect, useRef, useState } from "react";
import { createRecorder, requestMicrophonePermission, blobToWav } from "@/lib/audioUtils";
import { stopSpeaking } from "@/lib/tts";

interface AudioRecorderProps {
  filename: string;
  maxDuration?: number;
  onRecordingComplete: (blob: Blob, duration: number) => void;
  onRedo: () => void;
  onStreamReady?: (stream: MediaStream) => void;
  onRecordingActiveChange?: (active: boolean) => void;
}

type RS = "permission" | "ready" | "recording" | "done" | "error";

export default function AudioRecorder({ filename, maxDuration = 60, onRecordingComplete, onRedo, onStreamReady, onRecordingActiveChange }: AudioRecorderProps) {
  const [rs, setRs]           = useState<RS>("permission");
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const streamRef   = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef    = useRef<NodeJS.Timeout | null>(null);
  const startRef    = useRef(0);

  useEffect(() => {
    requestMicrophonePermission().then((s) => {
      if (!s) { setRs("error"); return; }
      streamRef.current = s;
      setRs("ready");
      onStreamReady?.(s);
    });
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); // eslint-disable-line

  function stop() {
    recorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    onRecordingActiveChange?.(false);
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    setAudioUrl(null);
    setElapsed(0);
    startRef.current = Date.now();

    const rec = createRecorder(stream, async (chunks) => {
      const raw = new Blob(chunks);
      const wav = await blobToWav(raw);
      setAudioUrl(URL.createObjectURL(wav));
      setRs("done");
      const dur = Math.round((Date.now() - startRef.current) / 1000);
      onRecordingComplete(wav, dur);
    });

    recorderRef.current = rec;
    rec.start(100);
    stopSpeaking();
    setRs("recording");
    onRecordingActiveChange?.(true);

    timerRef.current = setInterval(() => {
      setElapsed((e) => {
        const next = e + 1;
        if (next >= maxDuration) stop();
        return next;
      });
    }, 1000);
  }

  const pct        = Math.min((elapsed / maxDuration) * 100, 100);
  const remaining  = maxDuration - elapsed;

  // ── Combined status + action bar ──────────────────────────────────────────
  // The entire bar is the interactive element — no separate button row below.

  const barClickable = rs === "ready" || rs === "recording";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>

      {/* ── Main bar: status left · action right ── */}
      <div
        role={barClickable ? "button" : undefined}
        tabIndex={barClickable ? 0 : undefined}
        onClick={barClickable ? (rs === "ready" ? startRecording : stop) : undefined}
        onKeyDown={barClickable ? (e) => { if (e.key === "Enter" || e.key === " ") { rs === "ready" ? startRecording() : stop(); } } : undefined}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: rs === "recording" ? "#1a0533" : rs === "done" ? "#f0fdf4" : "#111827",
          borderRadius: 14,
          padding: "0 1rem",
          height: 60,
          cursor: barClickable ? "pointer" : "default",
          border: rs === "done" ? "1px solid #bbf7d0" : rs === "recording" ? "1px solid #6d28d9" : "1px solid transparent",
          transition: "background 0.3s",
          WebkitTapHighlightColor: "rgba(0,0,0,0.08)",
          userSelect: "none",
        }}
      >
        {/* Left: status text */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {rs === "ready"      && <><span style={{ fontSize: 18 }}>🎙</span><span style={{ color: "#e5e7eb", fontSize: "0.88rem", fontWeight: 600 }}>Tap to Record</span></>}
          {rs === "permission" && <span style={{ color: "#6b7280", fontSize: "0.85rem" }}>Requesting microphone…</span>}
          {rs === "error"      && <span style={{ color: "#f87171", fontSize: "0.85rem" }}>Microphone access denied</span>}
          {rs === "recording"  && (
            <>
              {/* Pulsing red dot */}
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "rlGlow 0.8s ease-in-out infinite" }} />
              <span style={{ color: "#c4b5fd", fontSize: "0.88rem", fontWeight: 600 }}>Recording</span>
              <span style={{ color: "#7c3aed", fontSize: "0.82rem" }}>{elapsed}s / {maxDuration}s</span>
            </>
          )}
          {rs === "done" && (
            <>
              <span style={{ fontSize: 18 }}>✅</span>
              <span style={{ color: "#15803d", fontSize: "0.88rem", fontWeight: 600 }}>Recording saved</span>
              {audioUrl && <audio controls src={audioUrl} style={{ height: 28, maxWidth: 140 }} />}
            </>
          )}
        </div>

        {/* Right: action pill */}
        {rs === "ready" && (
          <span style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", borderRadius: 999, padding: "0.4rem 1rem", fontSize: "0.82rem", fontWeight: 700, flexShrink: 0 }}>
            Record
          </span>
        )}
        {rs === "recording" && (
          <span style={{ background: "#374151", color: "#fff", borderRadius: 999, padding: "0.4rem 1rem", fontSize: "0.82rem", fontWeight: 700, flexShrink: 0 }}>
            ⏹ Stop · {remaining}s left
          </span>
        )}
        {rs === "done" && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setAudioUrl(null); setElapsed(0); setRs("ready"); onRedo(); }}
            style={{ background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 999, padding: "0.4rem 0.9rem", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
          >
            ↺ Redo
          </button>
        )}
      </div>

      {/* Progress bar — only while recording */}
      {rs === "recording" && (
        <div style={{ background: "#e5e7eb", borderRadius: 999, height: 3 }}>
          <div style={{ height: 3, borderRadius: 999, width: `${pct}%`, background: "linear-gradient(to right,#7c3aed,#a855f7)", transition: "width 1s linear" }} />
        </div>
      )}

      {/* Filename — tiny, unobtrusive */}
      <p style={{ fontSize: "0.68rem", color: "#c4b5fd", margin: 0, opacity: 0.7 }}>{filename}</p>
    </div>
  );
}
