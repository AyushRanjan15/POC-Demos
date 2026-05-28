# NOVA Backend API Contract

This document is the single source of truth for the interface between the NOVA frontend and the speech analytics backend.  
The frontend file that calls this API is **`lib/api.ts`**.

---

## Endpoint

```
POST /extract-features
Host: <your-backend-host>
Content-Type: multipart/form-data
```

### Request fields

| Field | Type | Description |
|---|---|---|
| `audio` | File (WAV) | Raw audio recording from the participant's microphone |
| `task` | string | One of: `days_of_week`, `ddk`, `picture_description` |

The audio is recorded at the browser's native sample rate (typically 44 100 Hz or 48 000 Hz), mono, PCM WAV.  
The filename follows the pattern: `{participantId}_{sessionId}_{taskId}.wav`  
(e.g. `P001_S001_ddk.wav`) and is included in the multipart upload.

### CORS

The backend must allow cross-origin requests from the frontend origin.  
Add the following headers to every response:

```
Access-Control-Allow-Origin: *          # or restrict to your frontend domain
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

Handle `OPTIONS` preflight requests with a `200 OK`.

---

## Responses

Return `Content-Type: application/json`.  
The response schema depends on the `task` field sent in the request.

---

### Task: `days_of_week`

```json
{
  "wer": 0.08,
  "phonemeErrorRate": 0.04,
  "wordAccuracy": 92.0,
  "phonemeAccuracy": 96.0
}
```

| Field | Type | Range | Description |
|---|---|---|---|
| `wer` | float | 0–1 | Word Error Rate (proportion, not percentage) |
| `phonemeErrorRate` | float | 0–1 | Phoneme Error Rate (proportion) |
| `wordAccuracy` | float | 0–100 | `(1 − wer) × 100` |
| `phonemeAccuracy` | float | 0–100 | `(1 − phonemeErrorRate) × 100` |

---

### Task: `ddk`

```json
{
  "nAttempts": 24,
  "nClean": 19,
  "cleanRatePct": 79.2,
  "bestPer": 0.0,
  "meanPerAll": 0.09,
  "meanPerClean": 0.02,
  "overallDdkRateCps": 5.8,
  "bestCleanDdkRateCps": 6.4,
  "ioiMeanS": 0.18,
  "ioiCv": 0.12,
  "phonemeAccuracyByPos": [95.0, 91.0, 88.0, 93.0, 82.0, 94.0]
}
```

| Field | Type | Description |
|---|---|---|
| `nAttempts` | int | Total PA-TA-KA repetitions produced |
| `nClean` | int | Repetitions at or below the PER clean threshold |
| `cleanRatePct` | float 0–100 | `(nClean / nAttempts) × 100` |
| `bestPer` | float 0–1 | Lowest PER achieved in any single attempt |
| `meanPerAll` | float 0–1 | Mean PER across all attempts |
| `meanPerClean` | float 0–1 | Mean PER restricted to clean attempts |
| `overallDdkRateCps` | float | `nAttempts / task_duration_seconds` (cycles per second) |
| `bestCleanDdkRateCps` | float | Rate during the best consecutive clean run (cps) |
| `ioiMeanS` | float | Mean inter-onset interval of clean attempts (seconds) |
| `ioiCv` | float | Coefficient of variation of the IOI (0 = perfectly regular) |
| `phonemeAccuracyByPos` | float[6] | Accuracy (0–100) for positions [P, A, T, A, K, A] |

**Phoneme position mapping:**

| Index | Phoneme | Notes |
|---|---|---|
| 0 | P | First consonant |
| 1 | A | First vowel |
| 2 | T | Second consonant |
| 3 | A | Second vowel |
| 4 | K | Third consonant (most demanding) |
| 5 | A | Third vowel |

---

### Task: `picture_description`

```json
{
  "intelligibilityScore": 88.5,
  "naturalnessScore": 76.2,
  "speechRate": 4.1,
  "pauseRate": 8.3
}
```

| Field | Type | Range | Description |
|---|---|---|---|
| `intelligibilityScore` | float | 0–100 | Estimated listener intelligibility (%) |
| `naturalnessScore` | float | 0–100 | Perceptual naturalness/fluency score (%) |
| `speechRate` | float | syllables/second | Rate during active speech (pauses excluded) |
| `pauseRate` | float | pauses/minute | Number of pauses per minute |

---

## Error responses

Return a non-2xx status code with a JSON body. The frontend will surface the error to the console and fall through to dummy metrics in development mode.

```json
{
  "error": "Unsupported audio format",
  "detail": "Expected WAV, received MP4"
}
```

---

## TypeScript interfaces (frontend reference)

These are defined in `types/index.ts` and must match the JSON above exactly (field names are camelCase):

```typescript
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
  phonemeAccuracyByPos: number[];   // length 6
}

export interface PictureMetrics {
  intelligibilityScore: number;
  naturalnessScore: number;
  speechRate: number;
  pauseRate: number;
}
```

---

## Dummy data (frontend fallback)

When `NEXT_PUBLIC_API_BASE_URL` is empty or unset, `lib/api.ts` returns randomly generated values within realistic clinical ranges.  
**No backend changes are needed for the demo** — set the env var only when the real models are ready.

---

## Minimal Python backend skeleton

```python
# backend/main.py
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import io, soundfile as sf

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

@app.post("/extract-features")
async def extract_features(
    audio: UploadFile = File(...),
    task: str = Form(...),
):
    audio_bytes = await audio.read()
    samples, sr = sf.read(io.BytesIO(audio_bytes))

    if task == "days_of_week":
        # TODO: call your Days-of-Week model
        return {
            "wer": 0.0,
            "phonemeErrorRate": 0.0,
            "wordAccuracy": 100.0,
            "phonemeAccuracy": 100.0,
        }

    if task == "ddk":
        # TODO: call your DDK model
        return {
            "nAttempts": 0,
            "nClean": 0,
            "cleanRatePct": 0.0,
            "bestPer": 0.0,
            "meanPerAll": 0.0,
            "meanPerClean": 0.0,
            "overallDdkRateCps": 0.0,
            "bestCleanDdkRateCps": 0.0,
            "ioiMeanS": 0.0,
            "ioiCv": 0.0,
            "phonemeAccuracyByPos": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        }

    if task == "picture_description":
        # TODO: call your Picture Description model
        return {
            "intelligibilityScore": 0.0,
            "naturalnessScore": 0.0,
            "speechRate": 0.0,
            "pauseRate": 0.0,
        }

    return {"error": f"Unknown task: {task}"}, 400
```

Run with:
```bash
pip install fastapi uvicorn soundfile python-multipart
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```
