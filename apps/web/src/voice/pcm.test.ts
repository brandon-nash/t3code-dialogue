import { describe, expect, it } from "vite-plus/test";

import { float32ToPcm16le } from "./pcm";

describe("float32ToPcm16le", () => {
  it("writes clamped little-endian 16-bit samples", () => {
    const bytes = float32ToPcm16le(new Float32Array([0, 1, -1, 2, -0.5]));
    const view = new DataView(bytes.buffer);
    expect([0, 1, 2, 3, 4].map((index) => view.getInt16(index * 2, true))).toEqual([
      0, 32767, -32768, 32767, -16384,
    ]);
  });
});
