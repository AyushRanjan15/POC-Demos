# NOVA — Production Deployment Guide

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 20 LTS or later |
| npm | 10+ (bundled with Node 20) |
| Python | 3.11 (for TTS audio generation only) |
| nginx or caddy | Any recent version (reverse proxy) |
| PM2 (optional) | `npm i -g pm2` |

---

## 1. Clone and install

```bash
git clone <repo-url>
cd speech-assessment
npm install
```

---

## 2. Environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# URL of the Python analytics backend
# Must be reachable from the client browser (not server-side only)
NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com
```

Leave `NEXT_PUBLIC_API_BASE_URL` blank to run in demo mode (random dummy metrics, no backend required).

> **Note:** The `NEXT_PUBLIC_` prefix is required — Next.js only exposes env vars with this prefix to the browser bundle.

---

## 3. Generate TTS audio (first-time and after text changes)

The app ships without pre-built audio files (they are excluded from the repository to keep the zip small).  
Generate them before the first build:

```bash
# Create the Python venv once
python3.11 -m venv /tmp/kokoro_env
/tmp/kokoro_env/bin/pip install kokoro soundfile

# Generate audio, build, and start the server
python3 scripts/generate_audio.py
```

This script:
1. Checks `public/audio/manifest.json` for changed or missing clips
2. Re-synthesises only the changed clips using Kokoro TTS (`bf_isabella` voice)
3. Runs `npm run build`
4. Starts the Next.js production server on port 3000

On subsequent deploys, only changed/added clips are re-synthesised.  
To change the voice, edit `"voice"` in `public/audio/manifest.json` and delete `public/audio/.hashes.json`.

---

## 4. Production server

### Option A — PM2 (recommended for a single server)

```bash
npm run build
pm2 start "npm run start -- --port 3000" --name nova
pm2 save
pm2 startup   # follow the printed instructions to auto-start on reboot
```

Monitor: `pm2 logs nova`  
Restart: `pm2 restart nova`

### Option B — systemd service

Create `/etc/systemd/system/nova.service`:

```ini
[Unit]
Description=NOVA Speech Assessment
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/nova/speech-assessment
ExecStart=/usr/bin/node node_modules/.bin/next start --port 3000
Restart=on-failure
Environment=NODE_ENV=production
EnvironmentFile=/opt/nova/speech-assessment/.env.local

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable nova
systemctl start nova
```

### Option C — Docker

```bash
docker build -t nova-frontend .
docker run -d \
  -p 3000:3000 \
  -e NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com \
  --name nova \
  nova-frontend
```

Or with Docker Compose (frontend + backend together):

```bash
docker-compose up -d
```

See `docker-compose.yml` for the full configuration.

---

## 5. Reverse proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # Microphone access requires HTTPS — do not skip this
    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Reload nginx: `nginx -s reload`

> **HTTPS is mandatory.** Browsers block `getUserMedia` (microphone access) on non-HTTPS origins.  
> Use [Let's Encrypt / Certbot](https://certbot.eff.org/) for a free certificate.

---

## 6. Backend (analytics API)

The Python backend runs independently. Minimum setup:

```bash
pip install fastapi uvicorn soundfile python-multipart
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

See `docs/API_CONTRACT.md` for the full API specification.

For production, place the backend behind Nginx as well:

```nginx
server {
    listen 443 ssl;
    server_name api.your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/api.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.your-domain.com/privkey.pem;

    client_max_body_size 50M;   # WAV files can be large

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 7. Checklist before go-live

- [ ] `NEXT_PUBLIC_API_BASE_URL` points to the live backend
- [ ] HTTPS certificate installed on both frontend and backend domains
- [ ] `npm run build` completes without TypeScript errors
- [ ] TTS audio files are generated (`public/audio/*.wav` present)
- [ ] Backend responds correctly to a test `POST /extract-features` request
- [ ] Microphone permission prompt appears on the assessment page
- [ ] PDF export downloads and contains charts

---

## 8. File size note for zip distribution

Before zipping, exclude large directories that can be regenerated:

```bash
zip -r nova.zip speech-assessment \
  --exclude "*/node_modules/*" \
  --exclude "*/.next/*" \
  --exclude "*/public/audio/*.wav"
```

The recipient runs `npm install` and `python3 scripts/generate_audio.py` to restore these.
