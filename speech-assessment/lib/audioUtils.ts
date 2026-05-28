export async function requestMicrophonePermission(): Promise<MediaStream | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    return stream;
  } catch {
    return null;
  }
}

export function createRecorder(
  stream: MediaStream,
  onDataAvailable: (chunks: Blob[]) => void
): MediaRecorder {
  const mimeType = getSupportedMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = () => {
    onDataAvailable(chunks);
  };

  return recorder;
}

function getSupportedMimeType(): string | null {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

export async function blobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    await audioCtx.close();
  }

  // Mix down to mono by averaging all channels
  const numSamples = audioBuffer.length;
  const numChannels = audioBuffer.numberOfChannels;
  const mixed = new Float32Array(numSamples);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < numSamples; i++) mixed[i] += channelData[i] / numChannels;
  }

  const sampleRate = audioBuffer.sampleRate;
  const bytesPerSample = 2; // 16-bit PCM
  const dataLength = numSamples * bytesPerSample;
  const wav = new ArrayBuffer(44 + dataLength);
  const v = new DataView(wav);

  const str = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i)); };
  str(0, "RIFF");  v.setUint32(4,  36 + dataLength, true);
  str(8, "WAVE");  str(12, "fmt ");
  v.setUint32(16, 16, true);          // PCM chunk size
  v.setUint16(20,  1, true);          // PCM format
  v.setUint16(22,  1, true);          // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  v.setUint16(32, bytesPerSample, true);              // block align
  v.setUint16(34, 16, true);          // bits per sample
  str(36, "data"); v.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, mixed[i]));
    v.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([wav], { type: "audio/wav" });
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}
