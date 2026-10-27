import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { describe } from "vite-plus/test";

import * as ServerConfig from "../config.ts";
import * as VoiceEngine from "./voiceEngine.ts";

const touch = Effect.fn("touch")(function* (dir: string, names: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(dir, { recursive: true });
  for (const name of names) yield* fs.writeFileString(path.join(dir, name), "");
});

describe("voice model discovery", () => {
  it.effect("finds Parakeet files and prefers int8 weights", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-voice-parakeet-" });
      yield* touch(dir, [
        "encoder.onnx",
        "encoder.int8.onnx",
        "decoder.int8.onnx",
        "joiner.int8.onnx",
        "tokens.txt",
      ]);

      const config = yield* VoiceEngine.resolveParakeetConfig(dir);
      expect(config.modelConfig.modelType).toBe("nemo_transducer");
      expect(config.modelConfig.transducer.encoder.endsWith("encoder.int8.onnx")).toBe(true);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reports a missing piece instead of guessing", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-voice-parakeet-" });
      yield* touch(dir, ["encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx"]);

      const error = yield* Effect.flip(VoiceEngine.resolveParakeetConfig(dir));
      expect(error._tag).toBe("VoiceModelsMissingError");
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("passes the US English lexicon and espeak data to Kokoro when present", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-voice-kokoro-" });
      yield* touch(dir, [
        "model.onnx",
        "voices.bin",
        "tokens.txt",
        "lexicon-gb-en.txt",
        "lexicon-us-en.txt",
      ]);
      yield* fs.makeDirectory(path.join(dir, "espeak-ng-data"));

      const config = yield* VoiceEngine.resolveKokoroConfig(dir);
      expect(config.model.kokoro.lexicon).toBe(path.join(dir, "lexicon-us-en.txt"));
      expect(config.model.kokoro.dataDir).toBe(path.join(dir, "espeak-ng-data"));
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe("loadSherpa", () => {
  // regression: the CommonJS exports arrive as `default` under ESM import, so the classes
  // were undefined and every model load failed.
  it.effect("exposes the recognizer and TTS factories from the native addon", () =>
    Effect.gen(function* () {
      const sherpa = yield* VoiceEngine.loadSherpa;
      expect(typeof sherpa.OfflineRecognizer.createAsync).toBe("function");
      expect(typeof sherpa.OfflineTts.createAsync).toBe("function");
    }),
  );
});

describe("parseVoiceSettings", () => {
  it("keeps valid settings and falls back on out-of-range values", () => {
    const settings = VoiceEngine.parseVoiceSettings({
      tts: { speakerId: 3.7, speed: 9 },
      replacements: { "that's metal": "🤘" },
    });
    expect(settings.ttsSpeakerId).toBe(3);
    expect(settings.ttsSpeed).toBe(1);
    expect(settings.phraseBook.replacements).toEqual([["that's metal", "🤘"]]);
  });
});

it.layer(
  VoiceEngine.layer.pipe(
    Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-voice-engine-" })),
    Layer.provideMerge(NodeServices.layer),
  ),
)("VoiceEngine without models", (it) => {
  it.effect("reports missing models without loading the native addon", () =>
    Effect.gen(function* () {
      const engine = yield* VoiceEngine.VoiceEngine;
      const status = yield* engine.status;
      expect(status.stt.state).toBe("missing_models");
      expect(status.tts.state).toBe("missing_models");
    }),
  );

  it.effect("fails transcription with a typed setup error", () =>
    Effect.gen(function* () {
      const engine = yield* VoiceEngine.VoiceEngine;
      const error = yield* Effect.flip(engine.transcribe(new Float32Array(16_000), 16_000));
      expect(error._tag).toBe("VoiceModelsMissingError");
    }),
  );

  it.effect("skips synthesis entirely when a reply is only code", () =>
    Effect.gen(function* () {
      const engine = yield* VoiceEngine.VoiceEngine;
      const speech = yield* engine.speak("```ts\nconst x = 1;\n```");
      expect(speech._tag).toBe("None");
    }),
  );
});
