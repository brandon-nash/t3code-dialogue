/** Audio conversions for push-to-talk: whatever the browser recorded -> mono PCM16LE @ 16 kHz. */

const SPEECH_SAMPLE_RATE = 16_000;

export function float32ToPcm16le(samples: Float32Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return bytes;
}

/**
 * Decodes a MediaRecorder blob (webm/opus in Chromium and Electron, mp4/aac in Safari) and
 * resamples it to 16 kHz mono with an OfflineAudioContext, which downmixes and low-pass
 * filters for us.
 */
export async function recordingToSpeechPcm(recording: Blob): Promise<Uint8Array<ArrayBuffer>> {
  const encoded = await recording.arrayBuffer();
  if (encoded.byteLength === 0) return new Uint8Array(0);

  const decoder = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decoder.decodeAudioData(encoded);
  } finally {
    void decoder.close();
  }

  const frameCount = Math.ceil(decoded.duration * SPEECH_SAMPLE_RATE);
  if (frameCount === 0) return new Uint8Array(0);
  const resampler = new OfflineAudioContext(1, frameCount, SPEECH_SAMPLE_RATE);
  const source = resampler.createBufferSource();
  source.buffer = decoded;
  source.connect(resampler.destination);
  source.start();
  const rendered = await resampler.startRendering();
  return float32ToPcm16le(rendered.getChannelData(0));
}
