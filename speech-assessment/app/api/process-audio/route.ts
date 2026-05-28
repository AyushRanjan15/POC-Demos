/**
 * POST /api/process-audio
 *
 * Server-side proxy that:
 *  1. Uploads the audio file to S3 via a presigned URL (shared across models)
 *  2. Runs the required ML models in parallel
 *  3. Maps raw model outputs to TaskMetrics and returns them to the browser
 *
 * The Cognito credentials and API Gateway URL never leave the server.
 *
 * Task → model mapping:
 *   days_of_week       → huper-phoneme-pipeline + whisperx
 *   ddk                → huper-phoneme-pipeline + sylber-time
 *   picture_description → als-intelligibility-mtpa + als-naturalness-mtpa + sylber-time
 */

import { NextRequest, NextResponse } from "next/server";
import {
  isConfigured,
  uploadAudio,
  runModel,
  resolveWhisperxResult,
} from "@/lib/inferenceClient";
import {
  mapDaysOfWeek,
  mapDDK,
  mapPictureDescription,
} from "@/lib/metricsMapper";
import type { TaskName, TaskMetrics } from "@/types";

export const runtime = "nodejs";
// Allow up to 5 minutes — SageMaker cold-start + inference can be slow
export const maxDuration = 300;

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Inference API not configured — set COGNITO_* and INFERENCE_API_BASE_URL env vars" },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const audioFile = formData.get("audio") as File | null;
  const taskId = formData.get("task") as TaskName | null;

  if (!audioFile || !taskId) {
    return NextResponse.json({ error: "Missing required fields: audio, task" }, { status: 400 });
  }

  try {
    const buffer = await audioFile.arrayBuffer();
    const filename = audioFile.name || `${taskId}_${Date.now()}.wav`;

    // Upload once — all models for this task share the same asset_id
    const assetId = await uploadAudio(buffer, filename);

    let metrics: TaskMetrics;

    if (taskId === "days_of_week") {
      const [huperRaw, whisperxRaw] = await Promise.all([
        runModel("huper-phoneme-pipeline", assetId),
        runModel("whisperx", assetId),
      ]);
      // whisperx may return summary + result_url instead of inline word data
      const whisperxData = await resolveWhisperxResult(whisperxRaw);
      metrics = mapDaysOfWeek(huperRaw, whisperxData);

    } else if (taskId === "ddk") {
      const [huperRaw, sylberRaw] = await Promise.all([
        runModel("huper-phoneme-pipeline", assetId),
        runModel("sylber-time", assetId),
      ]);
      metrics = mapDDK(huperRaw, sylberRaw);

    } else if (taskId === "picture_description") {
      const [intelligibilityRaw, naturalnessRaw, sylberRaw] = await Promise.all([
        runModel("als-intelligibility-mtpa", assetId),
        runModel("als-naturalness-mtpa", assetId),
        runModel("sylber-time", assetId),
      ]);
      metrics = mapPictureDescription(intelligibilityRaw, naturalnessRaw, sylberRaw);

    } else {
      return NextResponse.json({ error: `Unknown task: ${taskId}` }, { status: 400 });
    }

    return NextResponse.json(metrics);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Inference failed";
    console.error("[process-audio] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
