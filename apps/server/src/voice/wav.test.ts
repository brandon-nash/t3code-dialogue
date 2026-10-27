import { describe, expect, it } from "vite-plus/test";

import { float32ToWav, pcm16leToFloat32 } from "./wav.ts";

describe("wav", () => {
  it("decodes little-endian PCM16 into [-1, 1) floats", () => {
    const bytes = new Uint8Array([0x00, 0x80, 0x00, 0x00, 0x00, 0x40, 0x01]);
    // The trailing odd byte is ignored rather than read past the buffer.
    expect(Array.from(pcm16leToFloat32(bytes))).toEqual([-1, 0, 0.5]);
  });

  it("writes a playable mono 16-bit WAV header and clamps samples", () => {
    const wav = float32ToWav(new Float32Array([0, 1, -1, 2]), 24_000);
    const view = new DataView(wav.buffer);
    const ascii = (offset: number) => String.fromCharCode(...wav.slice(offset, offset + 4));

    expect(ascii(0)).toBe("RIFF");
    expect(ascii(8)).toBe("WAVE");
    expect(ascii(36)).toBe("data");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(24_000);
    expect(view.getUint32(40, true)).toBe(8);
    expect([0, 1, 2, 3].map((index) => view.getInt16(44 + index * 2, true))).toEqual([
      0, 32767, -32768, 32767,
    ]);
  });

  it("round-trips through PCM16 within quantization error", () => {
    const original = new Float32Array([0.25, -0.75, 0.1]);
    const decoded = pcm16leToFloat32(float32ToWav(original, 16_000).slice(44));
    decoded.forEach((sample, index) => {
      expect(sample).toBeCloseTo(original[index] ?? 0, 3);
    });
  });
});
