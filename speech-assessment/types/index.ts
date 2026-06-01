export interface SessionInfo {
  participantId: string;
  sessionId: string;
  startTime: string;
}

export type TaskName = "days_of_week" | "ddk" | "picture_description";

export interface Task {
  id: TaskName;
  title: string;
  instruction: string;
  ttsInstruction: string;
  duration?: number;
  tips?: string;
}

export interface TaskRecording {
  taskId: TaskName;
  blob: Blob;
  filename: string;
  duration: number;
}

export interface DaysMetrics {
  wer: number;
  phonemeErrorRate: number;
  wordAccuracy: number;
  phonemeAccuracy: number;
}

export interface DDKMetrics {
  nAttempts: number;
  nClean: number;
  cleanRatePct: number;
  bestPer: number;
  meanPerAll: number;
  meanPerClean: number;
  overallDdkRateCps: number;
  bestCleanDdkRateCps: number;
  ioiMeanS: number;
  ioiCv: number;
  phonemeAccuracyByPos: number[];
}

export interface VowelPoint {
  phoneme: string;
  f1: number;
  f2: number;
}

export interface PictureMetrics {
  intelligibilityScore: number;
  naturalnessScore: number;
  speechRate: number;
  pauseRate: number;
  // VSA — present only when HuPer returns F1/F2 formant values
  vsaHz2?: number | null;
  nVowelTokens?: number;
  nVowelTypes?: number;
  vowelScatter?: VowelPoint[];
  vowelMedians?: VowelPoint[];
  hullPath?: { f1: number; f2: number }[];
  // NLP — present only when WhisperX transcript is available for picture description
  nounRatio?: number | null;
  verbRatio?: number | null;
  adjAdvRatio?: number | null;
  funcWordRatio?: number | null;
  lexicalDensity?: number | null;
  msttr?: number | null;
  meanSentenceLength?: number | null;
  fillerWordRate?: number | null;
  totalWords?: number | null;
  transcript?: string | null;
}

// ── Domain summary scores (derived in frontend, not stored in session JSON) ───

export interface DomainScores {
  articulation:    number;   // 0–100
  fluency:         number;
  language:        number;
  intelligibility: number;
  novaIndex:       number;   // weighted composite
  hasNlp:          boolean;  // whether Language domain has data (requires transcript)
}

export type TaskMetrics = DaysMetrics | DDKMetrics | PictureMetrics;

export interface TaskResult {
  taskId: TaskName;
  taskTitle: string;
  metrics: TaskMetrics;
  filename: string;
}

export interface SessionResults {
  session: SessionInfo;
  taskResults: TaskResult[];
  completedAt: string;
}
