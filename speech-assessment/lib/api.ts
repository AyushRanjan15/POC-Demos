import { TaskMetrics, TaskName, DaysMetrics, DDKMetrics, PictureMetrics } from "@/types";

// When set to any non-empty value, real inference is used via /api/process-audio.
// Leave blank to run in demo mode (random simulated metrics, no backend required).
const USE_REAL_API = Boolean(process.env.NEXT_PUBLIC_API_BASE_URL);

export async function processAudio(
  blob: Blob,
  filename: string,
  taskId: TaskName
): Promise<TaskMetrics> {
  if (!USE_REAL_API) {
    return simulateMetrics(taskId);
  }

  const formData = new FormData();
  formData.append("audio", blob, filename);
  formData.append("task", taskId);

  const response = await fetch("/api/process-audio", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`Inference error (${response.status}): ${err.error ?? response.statusText}`);
  }

  return response.json();
}

function r(min: number, max: number) { return Math.random() * (max - min) + min; }
function rnd(n: number, d = 2) { return Math.round(n * 10 ** d) / 10 ** d; }
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function simulateMetrics(taskId: TaskName): TaskMetrics {
  if (taskId === "days_of_week") {
    const wer = rnd(r(0.04, 0.22));
    const per = rnd(r(0.02, 0.14));
    return {
      wer,
      phonemeErrorRate: per,
      wordAccuracy:    rnd(clamp((1 - wer) * 100, 0, 100), 1),
      phonemeAccuracy: rnd(clamp((1 - per) * 100, 0, 100), 1),
    } satisfies DaysMetrics;
  }

  if (taskId === "ddk") {
    const nAttempts = Math.round(r(18, 35));
    const nClean    = Math.round(nAttempts * r(0.70, 0.95));
    const overallRate    = rnd(r(4.5, 7.5));
    const bestCleanRate  = rnd(overallRate + r(0.3, 1.2));
    const meanPerAll     = rnd(r(0.05, 0.22));
    const meanPerClean   = rnd(meanPerAll * r(0.5, 0.8));
    const bestPer        = rnd(meanPerClean * r(0.3, 0.7));
    // phoneme accuracy at 6 positions: P A T A K A
    const base = r(72, 94);
    const phonemeAccuracyByPos = [
      rnd(clamp(base + r(-4, 4), 60, 100), 1),
      rnd(clamp(base + r(-3, 3), 60, 100), 1),
      rnd(clamp(base + r(-8, 4), 55, 100), 1),
      rnd(clamp(base + r(-3, 3), 60, 100), 1),
      rnd(clamp(base + r(-10, 4), 50, 100), 1),
      rnd(clamp(base + r(-3, 3), 60, 100), 1),
    ];
    return {
      nAttempts,
      nClean,
      cleanRatePct:        rnd((nClean / nAttempts) * 100, 1),
      bestPer,
      meanPerAll,
      meanPerClean,
      overallDdkRateCps:   overallRate,
      bestCleanDdkRateCps: bestCleanRate,
      ioiMeanS:            rnd(r(0.12, 0.28)),
      ioiCv:               rnd(r(0.08, 0.28)),
      phonemeAccuracyByPos,
    } satisfies DDKMetrics;
  }

  // picture_description
  return {
    intelligibilityScore: rnd(r(68, 97), 1),
    naturalnessScore:     rnd(r(60, 95), 1),
    speechRate:           rnd(r(2.8, 5.2)),
    pauseRate:            rnd(r(4, 18)),
  } satisfies PictureMetrics;
}
