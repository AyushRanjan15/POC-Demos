"use client";

import { useEffect, useRef, useState } from "react";
import { TASKS } from "@/lib/tasks";
import { speak, speakImmediate, stopSpeaking, unlockAudio, preloadAll, isSpeaking, setOnEnd } from "@/lib/tts";
import { processAudio } from "@/lib/api";
import { getIdToken, isAuthConfigured, redirectToLogin } from "@/lib/auth";
import { isApiConfigured } from "@/lib/inferenceClient";
import { SessionInfo, TaskRecording, TaskResult, SessionResults } from "@/types";
import Avatar, { AvatarState } from "@/components/Avatar";
import TaskCard from "@/components/TaskCard";

type Phase = "intro" | "tasks" | "processing";

const INTRO_TEXT = "Hello! I'm Nova, your assessment guide. Today we'll complete 3 short speech tasks together. Speak naturally — there are no right or wrong answers.";

export default function AssessmentPage() {
  const [participantId, setParticipantId] = useState("");
  const [sessionId, setSessionId]         = useState("");
  const [phase, setPhase]                 = useState<Phase>("intro");
  const [avatarState, setAvatarState]     = useState<AvatarState>("idle");
  const [taskIndex, setTaskIndex]         = useState(0);
  const [recordings, setRecordings]       = useState<TaskRecording[]>([]);
  const [processingStatus, setStatus] = useState("");
  // Holds in-flight inference promises keyed by taskId, fired as each recording completes.
  const inferencePromises = useRef<Map<string, Promise<TaskResult>>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const p = new URLSearchParams(window.location.search);
      const participant = p.get("participantId") || "";
      const session = p.get("sessionId") || "";
      setParticipantId(participant);
      setSessionId(session);

      if (isApiConfigured()) {
        if (!isAuthConfigured()) {
          throw new Error("Missing auth config: NEXT_PUBLIC_COGNITO_DOMAIN / NEXT_PUBLIC_COGNITO_CLIENT_ID");
        }
        if (!getIdToken()) {
          await redirectToLogin(window.location.pathname + window.location.search);
          return;
        }
      }

      // Pre-decode all audio clips — works on suspended AudioContext (no gesture needed).
      // Once buffers are in cache, speakImmediate() can play them synchronously inside
      // any button handler without an async gap — the iOS gesture-window requirement.
      preloadAll();

      if (isSpeaking()) {
        // Audio started from landing-page gesture — attach avatar callback only.
        setAvatarState("speaking");
        setOnEnd(() => setAvatarState("idle"));
        return;
      }

      // Desktop: AudioContext is already running, speak() works from async context.
      // iOS: context is suspended until a gesture — user must tap globe or button.
      speak(INTRO_TEXT, () => setAvatarState("idle")).then(() => {
        if (!cancelled) setAvatarState("speaking");
      }).catch(() => {});
    }

    init().catch((err) => {
      const message = err instanceof Error ? err.message : "Authentication initialization failed";
      console.error("[assessment/init] error:", message);
      setStatus(message);
      setPhase("processing");
      setAvatarState("idle");
    });

    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, []);

  function handleStartTasks() {
    stopSpeaking();
    unlockAudio(); // ensure context is active for task auto-play useEffect
    setPhase("tasks");
  }

  function handleTaskComplete(blob: Blob, duration: number) {
    stopSpeaking(); // stop any task TTS immediately
    const task     = TASKS[taskIndex];
    const filename = `${participantId}_${sessionId}_${task.id}.wav`;

    // Fire inference immediately — don't wait for all recordings to finish.
    const promise: Promise<TaskResult> = processAudio(blob, filename, task.id).then((metrics) => ({
      taskId: task.id,
      taskTitle: task.title,
      metrics,
      filename,
    }));
    inferencePromises.current.set(task.id, promise);

    const updated = [...recordings, { taskId: task.id, blob, filename, duration }];
    setRecordings(updated);

    if (taskIndex < TASKS.length - 1) {
      setTaskIndex(taskIndex + 1);
    } else {
      const sess: SessionInfo = { participantId, sessionId, startTime: new Date().toISOString() };
      runProcessing(sess);
    }
  }

  async function runProcessing(sess: SessionInfo) {
    setPhase("processing");
    setAvatarState("processing");
    const taskResults: TaskResult[] = [];

    for (const task of TASKS) {
      const promise = inferencePromises.current.get(task.id);
      if (!promise) continue;
      setStatus(`Analysing ${task.title}…`);
      const result = await promise;
      taskResults.push(result);
    }

    setAvatarState("completed");
    setStatus("Complete!");
    await new Promise((r) => setTimeout(r, 1200));

    const results: SessionResults = { session: sess, taskResults, completedAt: new Date().toISOString() };
    sessionStorage.setItem("speechAssessmentResults", JSON.stringify(results));
    window.location.href = "/results";
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "2rem 1rem", background: "#f8fafc" }}>

      {/* Header */}
      <div style={{ width: "100%", maxWidth: 640, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#7c3aed,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13 }}>R</div>
          <span style={{ fontWeight: 600, color: "#374151" }}>Redenlab</span>
        </div>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{participantId} · {sessionId}</span>
      </div>

      {/* ── Intro (single page) ── */}
      {phase === "intro" && (
        <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>

          {/* Tappable NOVA globe — primary audio trigger on iOS */}
          <button
            type="button"
            aria-label="Tap to hear introduction"
            onClick={() => {
              unlockAudio();   // plays 100ms silence synchronously — activates AudioContext
              stopSpeaking();
              setAvatarState("speaking");
              speakImmediate(INTRO_TEXT, () => setAvatarState("idle")); // zero async gap
            }}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", borderRadius: "50%" }}
          >
            <Avatar state={avatarState} size={160} taskPage />
          </button>

          <div style={{ textAlign: "center" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", margin: 0 }}>Hello, I&apos;m Nova</h2>
            <p style={{ color: "#6b7280", marginTop: 8, lineHeight: 1.6, fontSize: "0.95rem" }}>
              Your assessment guide. We&apos;ll complete {TASKS.length} short speech tasks. Speak clearly — there are no right or wrong answers.
            </p>
          </div>

          {/* Hear intro button */}
          <button type="button"
            onClick={() => {
              unlockAudio();
              stopSpeaking();
              setAvatarState("speaking");
              speak(INTRO_TEXT, () => setAvatarState("idle"));
            }}
            style={{ background: "linear-gradient(135deg,#ede9fe,#ddd6fe)", border: "1.5px solid #a78bfa", color: "#5b21b6", borderRadius: 999, padding: "0.65rem 1.8rem", fontSize: "0.95rem", fontWeight: 700, cursor: "pointer" }}>
            ▶ Hear introduction
          </button>

          {/* Task list */}
          <div style={{ width: "100%", background: "#fff", borderRadius: 16, border: "1px solid #f1f5f9", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", padding: "1.25rem" }}>
            <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", margin: "0 0 0.75rem" }}>Today&apos;s Tasks</p>
            {TASKS.map((task, i) => (
              <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                <span style={{ fontSize: "0.9rem", color: "#374151" }}>{task.title}</span>
              </div>
            ))}
          </div>

          <button type="button" onClick={handleStartTasks}
            style={{ width: "100%", padding: "1rem", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", fontSize: "1.05rem", fontWeight: 700, cursor: "pointer" }}>
            I&apos;m Ready — Start Tasks
          </button>
        </div>
      )}

      {/* ── Tasks ── */}
      {phase === "tasks" && (
        <TaskCard
          key={taskIndex}
          task={TASKS[taskIndex]}
          taskIndex={taskIndex}
          totalTasks={TASKS.length}
          participantId={participantId}
          sessionId={sessionId}
          onComplete={handleTaskComplete}
        />
      )}

      {/* ── Processing ── */}
      {phase === "processing" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem", marginTop: "5rem" }}>
          <Avatar state={avatarState} size={160} taskPage />
          <div style={{ textAlign: "center" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#111827", margin: 0 }}>
              {avatarState === "completed" ? "Analysis Complete" : "Analysing Your Speech"}
            </h2>
            <p style={{ color: "#6b7280", marginTop: 6, fontSize: "0.9rem" }}>{processingStatus}</p>
          </div>
        </div>
      )}
    </main>
  );
}
