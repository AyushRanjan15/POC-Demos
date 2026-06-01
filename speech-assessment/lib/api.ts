import { TaskMetrics, TaskName, DaysMetrics, DDKMetrics, PictureMetrics } from "@/types";
import { isApiConfigured, resolveWhisperxResult, runModel, uploadAudio } from "@/lib/inferenceClient";
import { mapDDK, mapDaysOfWeek, mapPictureDescription } from "@/lib/metricsMapper";

// When set to any non-empty value, real inference is used via API Gateway routes.
// Leave blank to run in demo mode (random simulated metrics, no backend required).
const USE_REAL_API = isApiConfigured();

export async function processAudio(
  blob: Blob,
  filename: string,
  taskId: TaskName
): Promise<TaskMetrics> {
  if (!USE_REAL_API) {
    return simulateMetrics(taskId);
  }

  const buffer = await blob.arrayBuffer();
  const assetId = await uploadAudio(buffer, filename);

  if (taskId === "days_of_week") {
    const [huperRaw, whisperxRaw] = await Promise.all([
      runModel("huper-phoneme-pipeline", assetId),
      runModel("whisperx", assetId),
    ]);
    const whisperxData = await resolveWhisperxResult(whisperxRaw);
    return mapDaysOfWeek(huperRaw, whisperxData);
  }

  if (taskId === "ddk") {
    const [huperRaw, sylberRaw] = await Promise.all([
      runModel("huper-phoneme-pipeline", assetId),
      runModel("sylber-time", assetId),
    ]);
    return mapDDK(huperRaw, sylberRaw);
  }

  if (taskId === "picture_description") {
    const [intelligibilityRaw, naturalnessRaw, sylberRaw, huperRaw, whisperxRaw] = await Promise.all([
      runModel("als-intelligibility-mtpa", assetId),
      runModel("als-naturalness-mtpa", assetId),
      runModel("sylber-time", assetId),
      runModel("huper-phoneme-pipeline", assetId),
      runModel("whisperx", assetId),
    ]);
    const whisperxData = await resolveWhisperxResult(whisperxRaw);
    return mapPictureDescription(intelligibilityRaw, naturalnessRaw, sylberRaw, huperRaw, whisperxData);
  }

  throw new Error(`Unknown task: ${taskId}`);
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
    msttr: rnd(r(0.66, 0.82), 3),
    lexicalDensity: rnd(r(40, 58), 1),
    verbRatio: rnd(r(14, 22), 1),
    meanSentenceLength: rnd(r(9, 16), 1),
    fillerWordRate: rnd(r(0, 6), 1),
    nounRatio: rnd(r(18, 26), 1),
    adjAdvRatio: rnd(r(5, 12), 1),
    funcWordRatio: rnd(r(32, 44), 1),
    totalWords: Math.round(r(45, 120)),
    transcript: "The picture shows a kitchen scene with a woman at the sink and two children reaching for cookies.",
  } satisfies PictureMetrics;
}
