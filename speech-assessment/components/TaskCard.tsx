"use client";

import { useState, useEffect } from "react";
import { Task } from "@/types";
import { speak, stopSpeaking, unlockAudio } from "@/lib/tts";
import AudioRecorder from "./AudioRecorder";
import Avatar, { AvatarState } from "./Avatar";
import Image from "next/image";

interface TaskCardProps {
  task: Task;
  taskIndex: number;
  totalTasks: number;
  participantId: string;
  sessionId: string;
  onComplete: (blob: Blob, duration: number) => void;
}

export default function TaskCard({ task, taskIndex, totalTasks, participantId, sessionId, onComplete }: TaskCardProps) {
  const [avatarState, setAvatarState]     = useState<AvatarState>("idle");
  const [micStream, setMicStream]         = useState<MediaStream | null>(null);
  const [hasRecording, setHasRecording]   = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingDuration, setDuration]  = useState(0);

  const filename = `${participantId}_${sessionId}_${task.id}.wav`;
  const isLast   = taskIndex === totalTasks - 1;

  // Auto-play TTS instruction when task mounts — guard against double-fire in strict mode
  useEffect(() => {
    let cancelled = false;
    stopSpeaking();
    setAvatarState("speaking");
    speak(task.ttsInstruction, () => {
      if (!cancelled) setAvatarState("idle");
    });
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, []); // eslint-disable-line

  return (
    // Extra bottom padding so sticky button never overlaps content
    <div style={{ width: "100%", maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.25rem", paddingBottom: 90 }}>

      {/* Progress header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: "0.7rem", color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
            Task {taskIndex + 1} of {totalTasks}
          </p>
          <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#111827", margin: "2px 0 0" }}>{task.title}</h2>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {Array.from({ length: totalTasks }).map((_, i) => (
            <div key={i} style={{
              height: 6, borderRadius: 3,
              width: i === taskIndex ? 28 : i < taskIndex ? 20 : 8,
              background: i <= taskIndex ? "linear-gradient(to right,#7c3aed,#a855f7)" : "#e5e7eb",
            }} />
          ))}
        </div>
      </div>

      {/* Avatar + instruction */}
      <div style={{ background: "linear-gradient(135deg,#faf5ff,#f3e8ff)", border: "1px solid #e9d5ff", borderRadius: 16, padding: "1.25rem", display: "flex", gap: "1rem", alignItems: "flex-start" }}>
        <div style={{ flexShrink: 0 }}>
          <Avatar state={avatarState} size={80} taskPage stream={avatarState === "listening" ? micStream : null} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ color: "#374151", lineHeight: 1.6, margin: 0, fontSize: "0.95rem" }}>{task.instruction}</p>
          <button
            type="button"
            onClick={() => {
              unlockAudio(); // sync — must happen before any await in speak()
              stopSpeaking();
              setAvatarState("speaking");
              speak(task.ttsInstruction, () => setAvatarState("idle"));
            }}
            style={{ marginTop: 10, background: "none", border: "none", color: "#7c3aed", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer", padding: 0 }}
          >
            ▶ Repeat instructions
          </button>
        </div>
      </div>

      {/* Tips */}
      {task.tips && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "0.75rem 1rem", fontSize: "0.85rem", color: "#92400e" }}>
          💡 {task.tips}
        </div>
      )}

      {/* Cookie Theft image */}
      {task.id === "picture_description" && (
        <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid #e5e7eb", background: "#f9fafb" }}>
          <Image
            src="/images/cookie_theft.jpg"
            alt="Cookie Theft picture for description task"
            width={600}
            height={400}
            style={{ width: "100%", height: "auto", display: "block" }}
            priority
          />
        </div>
      )}

      {/* Recorder — no wrapper card, bar is the UI */}
      <AudioRecorder
        filename={filename}
        maxDuration={task.duration}
        onStreamReady={(s) => setMicStream(s)}
        onRecordingActiveChange={(active) => setAvatarState(active ? "listening" : "idle")}
        onRecordingComplete={(blob, dur) => {
          setRecordingBlob(blob);
          setDuration(dur);
          setHasRecording(true);
          setAvatarState("completed");
          setTimeout(() => setAvatarState("idle"), 2000);
        }}
        onRedo={() => {
          setRecordingBlob(null);
          setHasRecording(false);
          setAvatarState("idle");
        }}
      />

      {/* Sticky bottom button — always visible, never requires scrolling */}
      <div style={{
        position: "fixed",
        bottom: 0, left: 0, right: 0,
        padding: "0.75rem 1rem",
        background: "rgba(248,250,252,0.95)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderTop: "1px solid #e9d5ff",
        zIndex: 50,
      }}>
        <button
          type="button"
          disabled={!hasRecording}
          onClick={() => { if (recordingBlob) onComplete(recordingBlob, recordingDuration); }}
          style={{
            width: "100%", maxWidth: 640, margin: "0 auto", display: "block",
            padding: "1rem", borderRadius: 14, border: "none",
            background: hasRecording ? "linear-gradient(135deg,#7c3aed,#a855f7)" : "#e5e7eb",
            color: hasRecording ? "#fff" : "#9ca3af",
            fontSize: "1rem", fontWeight: 700,
            cursor: hasRecording ? "pointer" : "default",
            opacity: hasRecording ? 1 : 0.7,
          }}
        >
          {isLast ? "Submit & View Results →" : "Next Task →"}
        </button>
      </div>
    </div>
  );
}
