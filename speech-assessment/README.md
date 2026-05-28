# NOVA — Speech Assessment Platform

A browser-based speech assessment tool for clinical neurodisorder screening.  
Built with **Next.js 16**, deployed as a static-export-compatible app, and designed to connect to a Python speech analytics backend.

---

## Repository layout

```
speech-assessment/
├── app/                        # Next.js App Router pages
│   ├── page.tsx                # Landing / home
│   ├── assessment/page.tsx     # Recording session (3 tasks)
│   └── results/page.tsx        # Metrics dashboard + PDF export
├── components/
│   ├── AudioRecorder.tsx       # Browser mic capture (WAV)
│   ├── Avatar.tsx              # Animated NOVA avatar
│   ├── TaskCard.tsx            # Per-task recording UI
│   └── charts/
│       └── MetricsChart.tsx    # Recharts visualisations (gauges, bars, radar)
├── lib/
│   ├── api.ts                  # ← API call + dummy-data fallback (key file)
│   ├── tasks.ts                # Task definitions (IDs, instructions, durations)
│   └── tts.ts                  # Web Audio / Kokoro TTS playback
├── public/
│   ├── audio/                  # Pre-synthesised TTS clips (WAV) + manifest
│   └── images/                 # PDF header/footer banners, logos
├── types/index.ts              # All TypeScript interfaces (shared with backend)
├── scripts/generate_audio.py   # TTS synthesis + build + server restart
├── docs/
│   ├── API_CONTRACT.md         # Backend API specification (read this first)
│   └── DEPLOYMENT.md           # Production deployment guide
├── Dockerfile                  # Container image for the frontend
├── docker-compose.yml          # Frontend + backend side-by-side
└── .env.local.example          # Environment variable template
```

---

## Quick start (demo mode — no backend required)

```bash
cd speech-assessment
npm install
cp .env.local.example .env.local   # leave NEXT_PUBLIC_API_BASE_URL blank
npm run dev
```

Open **http://localhost:3000**.  
With no API URL set, the app uses randomly generated dummy metrics so the full UI flow can be tested without a backend.

---

## Connecting the analytics backend

1. Set the backend URL in `.env.local`:

```
NEXT_PUBLIC_API_BASE_URL=http://your-backend-host:8000
```

2. The frontend sends each recorded audio file to:

```
POST /extract-features
Content-Type: multipart/form-data

Fields:
  audio   – WAV file blob
  task    – "days_of_week" | "ddk" | "picture_description"
```

3. The backend must return JSON matching the schema in `docs/API_CONTRACT.md`.

See **`lib/api.ts`** — this is the only file that talks to the backend.  
The switch from dummy data to live data requires no frontend changes beyond setting the environment variable.

---

## Audio TTS (voice: bf_isabella)

NOVA uses pre-synthesised Kokoro TTS clips for the avatar voice.  
Re-generate after any text change in `public/audio/manifest.json`:

```bash
# Requires Python 3.11 + the kokoro venv (first run installs it)
python3.11 -m venv /tmp/kokoro_env
/tmp/kokoro_env/bin/pip install kokoro soundfile

python3 scripts/generate_audio.py          # synthesise + build + start
python3 scripts/generate_audio.py --audio-only   # synthesise only
```

To change the voice, edit `"voice"` in `public/audio/manifest.json` and re-run.

---

## Further reading

| Document | Purpose |
|---|---|
| `docs/API_CONTRACT.md` | Exact request/response spec the backend must implement |
| `docs/DEPLOYMENT.md` | PM2, Nginx, Docker, HTTPS, environment setup |
