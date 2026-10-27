// sherpa-onnx-node ships JSDoc only. This declares the slice of its API the voice engine uses.
declare module "sherpa-onnx-node" {
  export interface OfflineStream {
    acceptWaveform(input: { samples: Float32Array; sampleRate: number }): void;
  }

  export class OfflineRecognizer {
    static createAsync(config: unknown): Promise<OfflineRecognizer>;
    createStream(): OfflineStream;
    decodeAsync(stream: OfflineStream): Promise<unknown>;
    getResult(stream: OfflineStream): { text: string };
  }

  export class OfflineTts {
    static createAsync(config: unknown): Promise<OfflineTts>;
    readonly sampleRate: number;
    readonly numSpeakers: number;
    generateAsync(request: {
      text: string;
      sid: number;
      speed: number;
    }): Promise<{ samples: Float32Array; sampleRate: number }>;
  }

  // CommonJS module: under ESM `import()` the exports object arrives as `default`.
  const sherpa: { OfflineRecognizer: typeof OfflineRecognizer; OfflineTts: typeof OfflineTts };
  export default sherpa;
}
