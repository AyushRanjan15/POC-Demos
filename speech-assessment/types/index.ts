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

export interface PictureMetrics {
  intelligibilityScore: number;
  naturalnessScore: number;
  speechRate: number;
  pauseRate: number;
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
