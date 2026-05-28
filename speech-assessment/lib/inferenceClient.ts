import { getIdToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_INFERENCE_API_BASE_URL ?? "";

function isApiConfigured(): boolean {
  return Boolean(API_BASE);
}

function requireIdToken(): string {
  const token = getIdToken();
  if (!token) throw new Error("Not authenticated");
  return token;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${requireIdToken()}`,
    "Content-Type": "application/json",
  };
}

export async function uploadAudio(buffer: ArrayBuffer, filename: string): Promise<string> {
  const urlRes = await fetch(`${API_BASE}/upload-url`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ filename, content_type: "audio/wav" }),
  });
  if (!urlRes.ok) {
    throw new Error(`/upload-url failed (${urlRes.status}): ${await urlRes.text()}`);
  }
  const { asset_id, upload_url } = (await urlRes.json()) as { asset_id: string; upload_url: string };

  const putRes = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": "audio/wav" },
    body: buffer,
  });
  if (!putRes.ok) throw new Error(`S3 PUT failed (${putRes.status})`);

  return asset_id;
}

export async function submitJob(
  model: string,
  assetId: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const MAX_ATTEMPTS = 12;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${API_BASE}/${model}/predict`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ asset_id: assetId, ...extra }),
    });

    if (res.status === 409) {
      await sleep(2000 + attempt * 1000);
      continue;
    }
    if (!res.ok) {
      throw new Error(`/${model}/predict failed (${res.status}): ${await res.text()}`);
    }

    const { job_id } = (await res.json()) as { job_id: string };
    return job_id;
  }

  throw new Error(`Asset ${assetId} was never marked uploaded after ${MAX_ATTEMPTS} attempts`);
}

export async function pollResult(jobId: string, timeoutMs = 300_000): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(`${API_BASE}/result/${jobId}`, {
      headers: {
        Authorization: `Bearer ${requireIdToken()}`,
      },
    });

    if (!res.ok) throw new Error(`/result/${jobId} failed (${res.status})`);
    const data = (await res.json()) as { status: string; error?: string };

    if (data.status === "completed") return data;
    if (data.status === "failed") throw new Error(`Job ${jobId} failed: ${data.error ?? "unknown error"}`);

    await sleep(3000);
  }

  throw new Error(`Timeout waiting for job ${jobId}`);
}

export async function runModel(
  model: string,
  assetId: string,
  extra: Record<string, unknown> = {}
): Promise<unknown> {
  const jobId = await submitJob(model, assetId, extra);
  return pollResult(jobId);
}

export async function resolveWhisperxResult(raw: unknown): Promise<unknown> {
  const d = raw as Record<string, unknown>;
  const result = d.result as Record<string, unknown> | undefined;
  if (result?.word_segments || result?.segments) return raw;

  if (typeof d.result_url === "string") {
    const res = await fetch(d.result_url);
    if (res.ok) {
      const fullResult = await res.json();
      return { ...d, result: fullResult };
    }
  }

  return raw;
}

export { isApiConfigured };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
