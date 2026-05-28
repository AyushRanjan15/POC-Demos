/**
 * Client for the Redenlab Intelligens ML API (via AWS API Gateway + Cognito).
 *
 * Auth: OAuth2 client credentials → Cognito access token → Bearer header.
 * Flow: upload-url → S3 PUT → /{model}/predict → poll /result/{job_id}
 *
 * All functions are server-side only (used from Next.js API routes).
 */

const API_BASE = process.env.INFERENCE_API_BASE_URL ?? "";
const TOKEN_URL = process.env.COGNITO_TOKEN_URL ?? "";
const CLIENT_ID = process.env.COGNITO_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET ?? "";
const SCOPE = process.env.COGNITO_SCOPE ?? "ml-api/predict";

// In-process token cache (survives across requests within the same Node process)
let _cachedToken: string | null = null;
let _tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiry - 60_000) return _cachedToken;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: SCOPE,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cognito token exchange failed (${res.status}): ${text}`);
  }

  const { access_token, expires_in } = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  _cachedToken = access_token;
  _tokenExpiry = Date.now() + expires_in * 1000;
  return _cachedToken;
}

async function authHeaders(): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await getAccessToken()}`,
    "Content-Type": "application/json",
  };
}

/**
 * Steps 1 + 2: obtain a presigned S3 URL and upload the audio buffer directly to S3.
 * Returns the `asset_id` to pass to subsequent /predict calls.
 */
export async function uploadAudio(
  buffer: ArrayBuffer,
  filename: string
): Promise<string> {
  const h = await authHeaders();

  const urlRes = await fetch(`${API_BASE}/upload-url`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ filename, content_type: "audio/wav" }),
  });
  if (!urlRes.ok) {
    throw new Error(`/upload-url failed (${urlRes.status}): ${await urlRes.text()}`);
  }
  const { asset_id, upload_url } = (await urlRes.json()) as {
    asset_id: string;
    upload_url: string;
  };

  // Upload goes directly to S3 — no API Gateway, no auth header
  const putRes = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": "audio/wav" },
    body: buffer,
  });
  if (!putRes.ok) {
    throw new Error(`S3 PUT failed (${putRes.status})`);
  }

  return asset_id;
}

/**
 * Step 3: submit an inference job. Retries on 409 (upload not yet confirmed
 * by the S3-event lambda — can take 1-5 s after the PUT completes).
 */
export async function submitJob(
  model: string,
  assetId: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const h = await authHeaders();
  const MAX_ATTEMPTS = 12;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${API_BASE}/${model}/predict`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ asset_id: assetId, ...extra }),
    });

    if (res.status === 409) {
      // S3 event hasn't fired yet — wait with exponential back-off
      await sleep(2000 + attempt * 1000);
      continue;
    }
    if (!res.ok) {
      throw new Error(
        `/${model}/predict failed (${res.status}): ${await res.text()}`
      );
    }
    const { job_id } = (await res.json()) as { job_id: string };
    return job_id;
  }

  throw new Error(
    `Asset ${assetId} was never marked 'uploaded' after ${MAX_ATTEMPTS} attempts`
  );
}

/**
 * Step 4: poll /result/{job_id} until the job completes or the timeout is reached.
 * Returns the full response body (shape varies by model — see metricsMapper.ts).
 */
export async function pollResult(
  jobId: string,
  timeoutMs = 300_000
): Promise<unknown> {
  const h = await authHeaders();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(`${API_BASE}/result/${jobId}`, { headers: h });
    if (!res.ok) {
      throw new Error(`/result/${jobId} failed (${res.status})`);
    }
    const data = (await res.json()) as {
      status: string;
      error?: string;
    };

    if (data.status === "completed") return data;
    if (data.status === "failed") {
      throw new Error(`Job ${jobId} failed: ${data.error ?? "unknown error"}`);
    }

    await sleep(3000);
  }

  throw new Error(`Timeout waiting for job ${jobId}`);
}

/**
 * Convenience: submit + poll in one call.
 */
export async function runModel(
  model: string,
  assetId: string,
  extra: Record<string, unknown> = {}
): Promise<unknown> {
  const jobId = await submitJob(model, assetId, extra);
  return pollResult(jobId);
}

/**
 * For whisperx: the default response only carries an aggregated summary.
 * Fetch the full word-level JSON from the presigned result_url when present.
 */
export async function resolveWhisperxResult(raw: unknown): Promise<unknown> {
  const d = raw as Record<string, unknown>;

  // Already has word-level data (old API format or direct result)
  const result = d.result as Record<string, unknown> | undefined;
  if (result?.word_segments || result?.segments) return raw;

  // New API format: summary + result_url
  if (typeof d.result_url === "string") {
    const res = await fetch(d.result_url);
    if (res.ok) {
      const fullResult = await res.json();
      return { ...d, result: fullResult };
    }
  }

  return raw;
}

export function isConfigured(): boolean {
  return Boolean(API_BASE && TOKEN_URL && CLIENT_ID && CLIENT_SECRET);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
