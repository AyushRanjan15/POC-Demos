/**
 * Maps raw ML model outputs from the Intelligens API to the TaskMetrics
 * shapes the frontend expects (DaysMetrics, DDKMetrics, PictureMetrics).
 *
 * Model outputs (from example responses):
 *   als-intelligibility-mtpa  → { result: { intelligibility_score: 0–200 } }
 *   als-naturalness-mtpa      → { result: { naturalness_score: 0–200 } }
 *   sylber-time               → { result: { SYL_COUNT, SYL_PERSEC, ARATE, P_MEAN, P_COV, P_PERCENT, DUR, ... } }
 *   huper-phoneme-pipeline    → { result: { intervals: [{phone, phone_start, phone_end}] } }
 *   whisperx                  → { result: { word_segments: [{word, score}], segments: [...] } }
 */

import type { DaysMetrics, DDKMetrics, PictureMetrics } from "@/types";

// ─── Utilities ────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function rnd(n: number, d = 2) {
  return Math.round(n * 10 ** d) / 10 ** d;
}

// ─── WhisperX helpers ─────────────────────────────────────────────────────────

interface WordSegment {
  word: string;
  start?: number;
  end?: number;
  score?: number;
  speaker?: string;
}

export function extractWords(whisperxData: unknown): WordSegment[] {
  const result = (whisperxData as Record<string, unknown>)?.result as
    | Record<string, unknown>
    | undefined;
  if (!result) return [];

  // word_segments is a flat array at the top level
  if (Array.isArray(result.word_segments)) return result.word_segments as WordSegment[];

  // Older format: word_segments nested inside segments[].words
  if (Array.isArray(result.segments)) {
    const words: WordSegment[] = [];
    for (const seg of result.segments as Array<{ words?: WordSegment[] }>) {
      if (Array.isArray(seg.words)) words.push(...seg.words);
    }
    return words;
  }

  return [];
}

// ─── Huper helpers ────────────────────────────────────────────────────────────

interface PhonemeInterval {
  phone: string;
  phone_start: number;
  phone_end: number;
}

export function extractIntervals(huperData: unknown): PhonemeInterval[] {
  const result = (huperData as Record<string, unknown>)?.result as
    | Record<string, unknown>
    | undefined;
  if (!result || !Array.isArray(result.intervals)) return [];
  return result.intervals as PhonemeInterval[];
}

// ─── Sylber helpers ───────────────────────────────────────────────────────────

interface SylberResult {
  STATUS: string;
  DUR: number;
  SYL_COUNT: number;
  SYL_PERSEC: number;
  SYL_PER_MEAN: number;
  SYL_DUR_MEAN: number;
  P_MEAN: number;
  P_STD: number;
  P_COV: number;
  SPEECH_PERCENT: number;
  P_PERCENT: number;
  ARATE: number;
  segments?: Array<{ syllable_id: number; start: number; end: number }>;
}

export function extractSylber(sylberData: unknown): SylberResult | null {
  const result = (sylberData as Record<string, unknown>)?.result as
    | SylberResult
    | undefined;
  return result ?? null;
}

// ─── WER ─────────────────────────────────────────────────────────────────────

function wordErrorRate(hypothesis: string[], reference: string[]): number {
  const n = reference.length;
  const m = hypothesis.length;
  if (n === 0) return m > 0 ? 1 : 0;

  const dp: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        reference[i - 1] === hypothesis[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return clamp(dp[n][m] / n, 0, 1);
}

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z]/g, "");
}

// ─── days_of_week ─────────────────────────────────────────────────────────────

const DAYS_REFERENCE = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

// Approximate CMU-dict phoneme counts per day (used for phoneme ER estimation)
const DAYS_PHONEME_COUNT = 46; // sum: 5+7+7+5+5+7+5 = 41 + a bit more

export function mapDaysOfWeek(
  huperData: unknown,
  whisperxData: unknown
): DaysMetrics {
  const words = extractWords(whisperxData);
  const hypothesis = words.map((w) => normalizeWord(w.word)).filter(Boolean);
  const wer = rnd(wordErrorRate(hypothesis, DAYS_REFERENCE));

  const intervals = extractIntervals(huperData);
  let phonemeErrorRate: number;

  if (intervals.length > 0) {
    // Compare recognized phoneme count to expected — a simple count-based proxy
    const recognized = intervals.length;
    const expected = DAYS_PHONEME_COUNT;
    const countDiff = Math.abs(recognized - expected) / expected;
    // Average the count-based diff with WER to account for substitution errors
    phonemeErrorRate = rnd(clamp((countDiff + wer) / 2, 0, 1));
  } else {
    // No huper result — estimate from WER
    phonemeErrorRate = rnd(clamp(wer * 0.85, 0, 1));
  }

  return {
    wer,
    phonemeErrorRate,
    wordAccuracy: rnd(clamp((1 - wer) * 100, 0, 100), 1),
    phonemeAccuracy: rnd(clamp((1 - phonemeErrorRate) * 100, 0, 100), 1),
  };
}

// ─── ddk ─────────────────────────────────────────────────────────────────────

// Expected ARPABET phonemes at each PATAKA position: P, A, T, A, K, A
const DDK_PHONES_BY_POS: string[][] = [
  ["P", "B"],                        // 0  P
  ["AH", "AA", "AE", "AY", "AO"],   // 1  A
  ["T", "D", "DX"],                  // 2  T
  ["AH", "AA", "AE", "AY", "AO"],   // 3  A
  ["K", "G"],                        // 4  K
  ["AH", "AA", "AE", "AY", "AO"],   // 5  A
];

function ddkPhonemeAccuracyByPos(intervals: PhonemeInterval[]): number[] {
  if (intervals.length === 0) return Array(6).fill(0);

  const counts = Array(6).fill(0);
  const hits = Array(6).fill(0);

  intervals.forEach((iv, i) => {
    const pos = i % 6;
    counts[pos]++;
    if (DDK_PHONES_BY_POS[pos].includes(iv.phone.toUpperCase())) {
      hits[pos]++;
    }
  });

  return Array.from({ length: 6 }, (_, pos) =>
    rnd(counts[pos] > 0 ? clamp((hits[pos] / counts[pos]) * 100, 0, 100) : 0, 1)
  );
}

export function mapDDK(huperData: unknown, sylberData: unknown): DDKMetrics {
  const sylber = extractSylber(sylberData);
  const intervals = extractIntervals(huperData);

  const sylCount = sylber?.SYL_COUNT ?? 0;
  const dur = Math.max(sylber?.DUR ?? 1, 0.1);
  const pMean = sylber?.P_MEAN ?? 0;
  const pCov = sylber?.P_COV ?? 0;

  // PATAKA = 3 syllables per cycle
  const nAttempts = Math.max(1, Math.round(sylCount / 3));

  const phonemeAccuracyByPos = ddkPhonemeAccuracyByPos(intervals);
  const meanPhonemeAcc = phonemeAccuracyByPos.reduce((s, v) => s + v, 0) / 6;
  const cleanFrac = clamp(meanPhonemeAcc / 100, 0, 1);

  const nClean = Math.round(nAttempts * cleanFrac);
  const perEstimate = clamp(1 - cleanFrac, 0, 1);

  const overallDdkRateCps = rnd(nAttempts / dur);
  // Best clean rate is modestly faster than overall
  const bestCleanDdkRateCps = rnd(overallDdkRateCps * clamp(1 + cleanFrac * 0.2, 1, 1.4));

  // IOI (inter-onset interval): mean pause between syllables
  const ioiMeanS =
    pMean > 0 ? rnd(pMean) : rnd(Math.max(dur / Math.max(sylCount, 1) - (sylber?.SYL_DUR_MEAN ?? 0.2), 0.05));

  return {
    nAttempts,
    nClean,
    cleanRatePct: rnd((nClean / nAttempts) * 100, 1),
    bestPer: rnd(perEstimate * 0.4),
    meanPerAll: rnd(perEstimate),
    meanPerClean: rnd(perEstimate * 0.5),
    overallDdkRateCps,
    bestCleanDdkRateCps,
    ioiMeanS,
    ioiCv: rnd(pCov),
    phonemeAccuracyByPos,
  };
}

// ─── picture_description ──────────────────────────────────────────────────────

function extractScore(data: unknown, key: string): number {
  const result = (data as Record<string, unknown>)?.result as
    | Record<string, number>
    | undefined;
  return result?.[key] ?? 0;
}

export function mapPictureDescription(
  intelligibilityData: unknown,
  naturalnessData: unknown,
  sylberData: unknown
): PictureMetrics {
  const sylber = extractSylber(sylberData);

  // Scores are 0–200 (sigmoid * target_max=200), normalize to 0–100
  const rawIntell = extractScore(intelligibilityData, "intelligibility_score");
  const rawNat = extractScore(naturalnessData, "naturalness_score");

  const dur = Math.max(sylber?.DUR ?? 1, 0.1);
  const sylCount = sylber?.SYL_COUNT ?? 0;
  const arate = sylber?.ARATE ?? 0;
  const pPercent = sylber?.P_PERCENT ?? 0;
  const pMean = sylber?.P_MEAN ?? 0;

  // Estimate number of pauses from total pause time and mean pause duration
  const numPauses =
    pPercent > 0 && pMean > 0
      ? (pPercent / 100) * dur / pMean
      : Math.max(0, sylCount - 1);

  return {
    intelligibilityScore: rnd(clamp(rawIntell / 2, 0, 100), 1),
    naturalnessScore: rnd(clamp(rawNat / 2, 0, 100), 1),
    speechRate: rnd(arate),
    pauseRate: rnd((numPauses / dur) * 60, 1),
  };
}
