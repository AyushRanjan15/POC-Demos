// NOVA TTS — plays pre-synthesized Kokoro WAV files from /public/audio/
// Uses Web Audio API so iOS does not duck volume when the mic is active.
// Falls back to Web Speech API only if a clip is not found in the manifest.
//
// To update audio: edit public/audio/manifest.json then run:
//   python3 scripts/generate_audio.py

let manifest: Array<{ id: string; file: string; text: string }> | null = null;

// Web Audio context — module-level so it persists across client-side navigations
let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;
// Mutable onEnd — lets the assessment page attach its avatar handler to
// audio that was started during the landing page gesture.
let currentOnEnd: (() => void) | null = null;

// Decoded buffer cache — populated eagerly during gesture so speak() in
// useEffect doesn't need to await fetch/decode (which loses the gesture window).
const bufferCache = new Map<string, AudioBuffer>();

// ── Load manifest once ──────────────────────────────────────────────────────
async function getManifest() {
  if (manifest) return manifest;
  try {
    const res = await fetch("/audio/manifest.json");
    const data = await res.json();
    manifest = data.clips;
  } catch {
    manifest = [];
  }
  return manifest!;
}

// ── Get/create AudioContext ─────────────────────────────────────────────────
function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

// ── Pre-decode all audio clips (no gesture required) ─────────────────────────
// Call from useEffect on page load. decodeAudioData works on a suspended
// AudioContext per spec — only source.start() needs the context running.
// By the time the user taps any button, all buffers are in cache and speak()
// can play instantly with zero async gap after unlockAudio().
export async function preloadAll(): Promise<void> {
  const clips = await getManifest();
  const ctx   = getAudioContext(); // creates context (may be suspended on iOS)
  await Promise.all(clips.map(async (clip) => {
    if (bufferCache.has(clip.file)) return;
    try {
      const r   = await fetch(`/audio/${clip.file}`);
      const ab  = await r.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab); // works regardless of ctx state
      normalizeBuffer(buf);
      bufferCache.set(clip.file, buf);
    } catch {}
  }));
}

// ── Unlock AudioContext — call synchronously in every button onClick ──────────
// Plays a 100ms silent buffer synchronously, which is what iOS requires to mark
// the AudioContext as "user-activated". resume() alone is not sufficient.
// After this call, source.start() works freely even from async code.
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  const ctx = getAudioContext();

  // 100ms of silence — long enough for iOS to register real audio activity
  const frameCount = Math.ceil(ctx.sampleRate * 0.1);
  const silence    = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const src        = ctx.createBufferSource();
  src.buffer = silence;
  src.connect(ctx.destination);
  src.start(0); // synchronous — must happen inside gesture event handler

  if (ctx.state === "suspended") ctx.resume(); // async but called within gesture
}

// ── Is audio currently playing ─────────────────────────────────────────────
export function isSpeaking(): boolean {
  return currentSource !== null;
}

// ── Speak immediately — synchronous, safe for iOS gesture handlers ──────────
// Requires preloadAll() to have been called first (buffers must be in cache).
// Falls back to Web Speech if buffer not cached.
// After playBuffer(), calls ctx.resume() so a still-suspended context starts;
// AudioBufferSourceNode queues automatically and plays once context is running.
export function speakImmediate(text: string, onEnd?: () => void): void {
  stopSpeaking();
  if (!manifest) { speakWebSpeech(text, onEnd); return; }
  const clip = manifest.find((c) => c.text.trim() === text.trim());
  if (!clip) { speakWebSpeech(text, onEnd); return; }
  const cached = bufferCache.get(clip.file);
  if (!cached) { speakWebSpeech(text, onEnd); return; }
  const ctx = getAudioContext();
  playBuffer(cached, onEnd);
  // Ensure context is running — queued source plays as soon as resume resolves.
  if (ctx.state !== "running") ctx.resume();
}

// ── Replace the onEnd callback for the currently playing audio ─────────────
export function setOnEnd(callback: () => void): void {
  currentOnEnd = callback;
}

// ── Stop any playing audio ──────────────────────────────────────────────────
export function stopSpeaking(): void {
  // Clear currentSource BEFORE stop() so onended skips the onEnd callback.
  const src = currentSource;
  currentSource = null;
  currentOnEnd = null;
  if (src) {
    try { src.stop(); } catch {}
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

// ── Normalize an AudioBuffer to a consistent peak level ────────────────────
// Modifies channel data in-place. Clips that are already loud are untouched;
// quieter clips (like the intro) are boosted to match the target peak.
function normalizeBuffer(buffer: AudioBuffer, targetPeak = 0.92): void {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  if (peak < 0.001 || peak >= targetPeak) return; // silent or already at target
  const gain = targetPeak / peak;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      data[i] *= gain;
    }
  }
}

// ── Play an AudioBuffer through the Web Audio graph ────────────────────────
function playBuffer(buffer: AudioBuffer, onEnd?: () => void): void {
  const ctx = getAudioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  currentSource = source;
  currentOnEnd = onEnd ?? null;

  source.onended = () => {
    if (currentSource === source) {
      currentSource = null;
      const cb = currentOnEnd;
      currentOnEnd = null;
      cb?.();
    }
  };
  source.start(0);
}

// ── Speak — play pre-synthesized clip, fallback to Web Speech ────────────────
export async function speak(text: string, onEnd?: () => void): Promise<void> {
  stopSpeaking();

  const clips  = await getManifest();
  const clip   = clips.find((c) => c.text.trim() === text.trim());

  if (clip) {
    try {
      const ctx    = getAudioContext();
      const cached = bufferCache.get(clip.file);

      if (cached) {
        // Buffer pre-decoded — play immediately. If ctx is still suspended
        // (iOS before unlock), source is queued and starts when resume() resolves.
        playBuffer(cached, onEnd);
        return;
      }

      // Buffer not in cache — fetch + decode (requires ctx running on iOS).
      if (ctx.state === "suspended") await ctx.resume();
      const response    = await fetch(`/audio/${clip.file}`);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      normalizeBuffer(audioBuffer);
      bufferCache.set(clip.file, audioBuffer);
      playBuffer(audioBuffer, onEnd);
      return;
    } catch {
      // fall through to Web Speech
    }
  }

  speakWebSpeech(text, onEnd);
}

// ── No-op — kept for API compatibility (no Kokoro to load) ─────────────────
export async function loadKokoro(_onProgress?: (msg: string) => void): Promise<boolean> {
  return true;
}

export function isKokoroReady(): boolean {
  return true;
}

// ── Web Speech fallback ─────────────────────────────────────────────────────
function speakWebSpeech(text: string, onEnd?: () => void): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd?.(); return;
  }
  window.speechSynthesis.cancel();
  const utter    = new SpeechSynthesisUtterance(text);
  utter.rate     = 0.88;
  utter.pitch    = 1.08;
  utter.volume   = 1;

  let ended = false;
  utter.onend = () => {
    if (!ended) { ended = true; onEnd?.(); }
  };
  utter.onerror = () => {
    if (!ended) { ended = true; onEnd?.(); }
  };

  // Set preferred voice only if already loaded — do NOT defer to voiceschanged.
  // On iOS, deferring speak() outside the gesture handler blocks playback entirely.
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) {
    const preferred = voices.find((v) =>
      v.lang.startsWith("en") &&
      (v.name.includes("Enhanced") || v.name.includes("Premium"))
    ) ?? voices.find((v) =>
      v.lang.startsWith("en") &&
      ["samantha", "karen", "victoria", "moira", "tessa"].some((n) =>
        v.name.toLowerCase().includes(n)
      )
    ) ?? voices.find((v) => v.lang.startsWith("en"));
    if (preferred) utter.voice = preferred;
  }
  // Always speak immediately — iOS uses default voice if none selected (that's fine).
  window.speechSynthesis.speak(utter);
}
