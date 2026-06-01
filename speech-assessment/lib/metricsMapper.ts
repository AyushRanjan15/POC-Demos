import type { DDKMetrics, DaysMetrics, PictureMetrics } from "@/types";

interface WordSegment {
  word: string;
  start?: number;
  end?: number;
  score?: number;
  speaker?: string;
}

interface PhonemeInterval {
  phone: string;
  phone_start: number;
  phone_end: number;
  f1_hz?: number;
  f2_hz?: number;
}

interface SylberSegment {
  syllable_id?: number;
  start: number;
  end: number;
}

interface SylberResult {
  DUR?: number;
  SYL_PERSEC?: number;
  SYL_DUR_MEAN?: number;
  SYL_DUR_COV?: number;
  segments?: SylberSegment[];
}

const DAYS_REF_WORDS = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

const DAYS_REF_PHONES_FLAT = [
  "M", "AH", "N", "D", "EY",
  "T", "UW", "Z", "D", "EY",
  "W", "EH", "N", "Z", "D", "EY",
  "TH", "ER", "Z", "D", "EY",
  "F", "R", "AY", "D", "EY",
  "S", "AE", "T", "ER", "D", "EY",
  "S", "AH", "N", "D", "EY",
];

const PATAKA_CYCLE = ["P", "AH", "T", "AH", "K", "AH"] as const;
const PER_CLEAN_THRESH = 0.15;
const FILLERS = new Set(["um", "uh", "like", "so", "basically", "right", "okay", "actually"]);
const FUNCTION_WORDS = new Set([
  "the", "a", "an", "to", "of", "in", "on", "at", "for", "from", "with", "and", "or", "but", "if",
  "that", "this", "these", "those", "is", "am", "are", "was", "were", "be", "been", "being", "do",
  "does", "did", "have", "has", "had", "i", "you", "he", "she", "it", "we", "they", "me", "him",
  "her", "us", "them", "my", "your", "his", "their", "our", "as", "by", "about", "into", "over",
  "under", "after", "before", "while", "because", "than", "then", "so",
]);
const COMMON_VERBS = new Set([
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "go", "goes", "went", "see", "sees", "saw", "look", "looks", "looked", "stand", "stands", "stood",
  "sit", "sits", "sat", "wash", "washes", "washed", "spill", "spills", "spilled", "reach", "reaches",
  "reached", "watch", "watches", "watched", "notice", "notices", "noticed",
]);
const ARPABET_VOWELS = new Set([
  "AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW",
]);

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function rnd(n: number, d = 2): number {
  return Math.round(n * 10 ** d) / 10 ** d;
}

function cleanWord(w: string): string {
  return w.toLowerCase().replace(/[^\w]/g, "");
}

function editDistance(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

function extractScore(data: unknown, key: string): number {
  const result = (data as Record<string, unknown>)?.result as Record<string, number> | undefined;
  return result?.[key] ?? 0;
}

export function extractWords(whisperxData: unknown): WordSegment[] {
  const result = (whisperxData as Record<string, unknown>)?.result as Record<string, unknown> | undefined;
  if (!result) return [];

  if (Array.isArray(result.word_segments)) return result.word_segments as WordSegment[];

  if (Array.isArray(result.segments) && result.segments.length > 0) {
    const first = result.segments[0] as { words?: WordSegment[] };
    if (Array.isArray(first.words)) return first.words;
  }

  if (Array.isArray(result.segments)) {
    const words: WordSegment[] = [];
    for (const seg of result.segments as Array<{ words?: WordSegment[] }>) {
      if (Array.isArray(seg.words)) words.push(...seg.words);
    }
    return words;
  }

  return [];
}

export function extractIntervals(huperData: unknown): PhonemeInterval[] {
  const result = (huperData as Record<string, unknown>)?.result as Record<string, unknown> | undefined;
  if (!result || !Array.isArray(result.intervals)) return [];
  return result.intervals as PhonemeInterval[];
}

export function extractSylber(sylberData: unknown): SylberResult | null {
  const result = (sylberData as Record<string, unknown>)?.result as SylberResult | undefined;
  return result ?? null;
}

export function mapDaysOfWeek(huperData: unknown, whisperxData: unknown): DaysMetrics {
  const words = extractWords(whisperxData);
  const hypWords = words.map((w) => cleanWord(w.word)).filter(Boolean);
  const wer = rnd(
    Math.min(editDistance(DAYS_REF_WORDS, hypWords) / Math.max(DAYS_REF_WORDS.length, 1), 1),
    4
  );

  const intervals = extractIntervals(huperData);
  const hypPhones = intervals.map((seg) => seg.phone.toUpperCase());
  const per = rnd(
    Math.min(editDistance(DAYS_REF_PHONES_FLAT, hypPhones) / Math.max(DAYS_REF_PHONES_FLAT.length, 1), 1),
    4
  );

  return {
    wer,
    phonemeErrorRate: per,
    wordAccuracy: rnd((1 - wer) * 100, 1),
    phonemeAccuracy: rnd((1 - per) * 100, 1),
  };
}

function parsePatakaPhones(phones: string[]): {
  nAttempts: number;
  perPerCycle: number[];
  perByPosAccuracy: number[];
} {
  if (!phones.length) {
    return { nAttempts: 0, perPerCycle: [], perByPosAccuracy: [0, 0, 0, 0, 0, 0] };
  }

  const cycles: string[][] = [];
  for (let i = 0; i < phones.length; i += 6) {
    const c = phones.slice(i, i + 6);
    if (c.length >= 3) cycles.push(c);
  }

  const perPerCycle: number[] = [];
  const errorsByPos: number[][] = [[], [], [], [], [], []];

  for (const cyc of cycles) {
    const padded = [...cyc, "", "", "", "", "", ""].slice(0, 6);
    let errors = 0;
    for (let i = 0; i < 6; i++) {
      const mismatch = padded[i] !== PATAKA_CYCLE[i];
      if (mismatch) errors += 1;
      errorsByPos[i].push(mismatch ? 1 : 0);
    }
    perPerCycle.push(rnd(errors / 6, 4));
  }

  const perByPosAccuracy = errorsByPos.map((arr) =>
    arr.length ? rnd((1 - arr.reduce((a, b) => a + b, 0) / arr.length) * 100, 1) : 0
  );

  return { nAttempts: cycles.length, perPerCycle, perByPosAccuracy };
}

function bestCleanRate(syllables: SylberSegment[], cleanMask: boolean[]): number {
  if (!syllables.length || !cleanMask.some(Boolean)) return 0;

  const lim = Math.min(syllables.length, cleanMask.length);
  let best = 0;
  let runStart: number | null = null;

  const update = (s: number, e: number) => {
    if (e <= s) return;
    const dur = syllables[e].end - syllables[s].start;
    if (dur > 0) best = Math.max(best, rnd((e - s + 1) / dur, 3));
  };

  for (let i = 0; i < lim; i++) {
    if (cleanMask[i] && runStart === null) runStart = i;
    else if (!cleanMask[i] && runStart !== null) {
      update(runStart, i - 1);
      runStart = null;
    }
  }
  if (runStart !== null) update(runStart, lim - 1);

  return best;
}

export function mapDDK(huperData: unknown, sylberData: unknown): DDKMetrics {
  const intervals = extractIntervals(huperData);
  const phones = intervals.map((seg) => seg.phone.toUpperCase());
  const syl = extractSylber(sylberData) ?? {};
  const syllables = Array.isArray(syl.segments) ? syl.segments : [];

  const { nAttempts, perPerCycle, perByPosAccuracy } = parsePatakaPhones(phones);
  const cleanMask = perPerCycle.map((p) => p <= PER_CLEAN_THRESH);
  const nClean = cleanMask.filter(Boolean).length;
  const cleanPers = perPerCycle.filter((_, i) => cleanMask[i]);

  return {
    nAttempts,
    nClean,
    cleanRatePct: nAttempts ? rnd((nClean / nAttempts) * 100, 1) : 0,
    bestPer: rnd(Math.min(...(perPerCycle.length ? perPerCycle : [0])), 4),
    meanPerAll: rnd(
      perPerCycle.length ? perPerCycle.reduce((a, b) => a + b, 0) / perPerCycle.length : 0,
      4
    ),
    meanPerClean: rnd(
      cleanPers.length ? cleanPers.reduce((a, b) => a + b, 0) / cleanPers.length : 0,
      4
    ),
    overallDdkRateCps: rnd(syl.SYL_PERSEC ?? 0, 3),
    bestCleanDdkRateCps: bestCleanRate(syllables, cleanMask),
    ioiMeanS: rnd(syl.SYL_DUR_MEAN ?? 0, 4),
    ioiCv: rnd(syl.SYL_DUR_COV ?? 0, 4),
    phonemeAccuracyByPos: perByPosAccuracy,
  };
}

function computePauseRate(syllables: SylberSegment[], duration: number): number {
  if (!syllables.length || duration <= 0) return 0;
  const pauseThreshold = 0.15;
  let pauses = 0;
  for (let i = 1; i < syllables.length; i++) {
    if (syllables[i].start - syllables[i - 1].end > pauseThreshold) pauses += 1;
  }
  return rnd(pauses / (duration / 60), 1);
}

function convexHull(points: Array<{ f1: number; f2: number }>): Array<{ f1: number; f2: number }> {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a.f2 - b.f2 || a.f1 - b.f1);
  const cross = (o: { f1: number; f2: number }, a: { f1: number; f2: number }, b: { f1: number; f2: number }) =>
    (a.f2 - o.f2) * (b.f1 - o.f1) - (a.f1 - o.f1) * (b.f2 - o.f2);
  const lower: Array<{ f1: number; f2: number }> = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<{ f1: number; f2: number }> = [];
  for (const p of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function polygonArea(points: Array<{ f1: number; f2: number }>): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].f2 * points[j].f1 - points[j].f2 * points[i].f1;
  }
  return Math.abs(area) / 2;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeVsa(huperData?: unknown): Partial<PictureMetrics> {
  const intervals = huperData ? extractIntervals(huperData) : [];
  const vowelTokens = intervals.filter((s) =>
    ARPABET_VOWELS.has(s.phone.toUpperCase()) &&
    typeof s.f1_hz === "number" &&
    typeof s.f2_hz === "number"
  ) as Array<PhonemeInterval & { f1_hz: number; f2_hz: number }>;

  if (!vowelTokens.length) {
    return {
      vsaHz2: null, nVowelTokens: 0, nVowelTypes: 0, vowelScatter: [], vowelMedians: [], hullPath: [],
    };
  }

  const byPh = new Map<string, Array<{ f1: number; f2: number }>>();
  for (const t of vowelTokens) {
    const ph = t.phone.toUpperCase();
    if (!byPh.has(ph)) byPh.set(ph, []);
    byPh.get(ph)!.push({ f1: t.f1_hz, f2: t.f2_hz });
  }

  const vowelMedians: Array<{ phoneme: string; f1: number; f2: number }> = [];
  for (const [ph, tokens] of [...byPh.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (tokens.length < 3) continue;
    vowelMedians.push({
      phoneme: ph,
      f1: median(tokens.map((x) => x.f1)),
      f2: median(tokens.map((x) => x.f2)),
    });
  }

  const vowelScatter = vowelTokens.map((t) => ({ phoneme: t.phone.toUpperCase(), f1: t.f1_hz, f2: t.f2_hz }));
  if (vowelMedians.length < 3) {
    return {
      vsaHz2: null,
      nVowelTokens: vowelTokens.length,
      nVowelTypes: vowelMedians.length,
      vowelScatter,
      vowelMedians,
      hullPath: [],
    };
  }

  const hullPath = convexHull(vowelMedians.map((m) => ({ f1: m.f1, f2: m.f2 })));
  return {
    vsaHz2: rnd(polygonArea(hullPath), 2),
    nVowelTokens: vowelTokens.length,
    nVowelTypes: vowelMedians.length,
    vowelScatter,
    vowelMedians,
    hullPath,
  };
}

function msttr(words: string[], window = 50): number {
  if (!words.length) return 0;
  if (words.length < window) return rnd(new Set(words).size / words.length, 3);
  const chunks: number[] = [];
  for (let i = 0; i <= words.length - window; i += window) {
    chunks.push(new Set(words.slice(i, i + window)).size / window);
  }
  return rnd(chunks.length ? chunks.reduce((a, b) => a + b, 0) / chunks.length : 0, 3);
}

function computeNlp(whisperxData: unknown, duration: number): Partial<PictureMetrics> {
  const result = (whisperxData as Record<string, unknown>)?.result as Record<string, unknown> | undefined;
  if (!result) {
    return {
      nounRatio: null, verbRatio: null, adjAdvRatio: null, funcWordRatio: null,
      lexicalDensity: null, msttr: null, meanSentenceLength: null, fillerWordRate: null,
      totalWords: null, transcript: null,
    };
  }

  const segments = Array.isArray(result.segments) ? result.segments as Array<{ text?: string }> : [];
  const transcript = segments.map((s) => s.text ?? "").join(" ").replace(/\s+/g, " ").trim();
  const words = transcript
    .split(/\s+/)
    .map((w) => cleanWord(w))
    .filter(Boolean);
  if (words.length < 5) {
    return {
      nounRatio: null, verbRatio: null, adjAdvRatio: null, funcWordRatio: null,
      lexicalDensity: null, msttr: null, meanSentenceLength: null, fillerWordRate: null,
      totalWords: null, transcript: transcript || null,
    };
  }

  const total = words.length;
  const verbCount = words.filter((w) =>
    COMMON_VERBS.has(w) || /(ed|ing)$/.test(w)
  ).length;
  const adjAdvCount = words.filter((w) => /(ly|ous|ive|able|al|ic|ish)$/.test(w)).length;
  const functionCount = words.filter((w) => FUNCTION_WORDS.has(w)).length;
  const nounCount = Math.max(0, total - verbCount - adjAdvCount - functionCount);
  const lexicalDensity = ((nounCount + verbCount + adjAdvCount) / total) * 100;
  const sentencePieces = transcript.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const sentenceLens = sentencePieces.map((s) => s.split(/\s+/).filter(Boolean).length);
  const fillerCount = words.filter((w) => FILLERS.has(w)).length;
  const durMin = duration > 0 ? duration / 60 : 1;

  return {
    nounRatio: rnd((nounCount / total) * 100, 1),
    verbRatio: rnd((verbCount / total) * 100, 1),
    adjAdvRatio: rnd((adjAdvCount / total) * 100, 1),
    funcWordRatio: rnd((functionCount / total) * 100, 1),
    lexicalDensity: rnd(lexicalDensity, 1),
    msttr: msttr(words, 50),
    meanSentenceLength: rnd(sentenceLens.length ? sentenceLens.reduce((a, b) => a + b, 0) / sentenceLens.length : 0, 1),
    fillerWordRate: rnd(fillerCount / durMin, 1),
    totalWords: total,
    transcript,
  };
}

export function mapPictureDescription(
  intelligibilityData: unknown,
  naturalnessData: unknown,
  sylberData: unknown,
  huperData?: unknown,
  whisperxData?: unknown
): PictureMetrics {
  const syl = extractSylber(sylberData) ?? {};
  const syllables = Array.isArray(syl.segments) ? syl.segments : [];
  const duration = syl.DUR ?? 0;

  const intelRaw = extractScore(intelligibilityData, "intelligibility_score");
  const natRaw = extractScore(naturalnessData, "naturalness_score");

  return {
    intelligibilityScore: rnd(clamp((intelRaw / 220) * 100, 0, 100), 1),
    naturalnessScore: rnd(clamp((natRaw / 220) * 100, 0, 100), 1),
    speechRate: rnd(syl.SYL_PERSEC ?? 0, 2),
    pauseRate: computePauseRate(syllables, duration),
    ...computeVsa(huperData),
    ...computeNlp(whisperxData, duration),
  };
}
