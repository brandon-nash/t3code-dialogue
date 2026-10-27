/**
 * Local STT (Parakeet) and TTS (Kokoro) through sherpa-onnx, models under `<T3 home>/voice`.
 * Models load on first use; a missing model is a typed error and a status, never a crash.
 */
import type { OfflineRecognizer, OfflineTts } from "sherpa-onnx-node";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import { VOICE_STT_SAMPLE_RATE } from "@t3tools/contracts";

import * as ServerConfig from "../config.ts";
import {
  applyPhraseBook,
  EMPTY_PHRASE_BOOK,
  parsePhraseBook,
  type PhraseBook,
} from "./phraseBook.ts";
import { toSpeakableText } from "./speechText.ts";
import { appendVoiceTiming, VOICE_TIMINGS_FILE } from "./voiceTimings.ts";
import { float32ToWav } from "./wav.ts";

const MODEL_THREADS = 2;

class VoiceModelsMissingError extends Data.TaggedError("VoiceModelsMissingError")<{
  readonly detail: string;
}> {}

class VoiceRuntimeUnavailableError extends Data.TaggedError("VoiceRuntimeUnavailableError")<{
  readonly detail: string;
}> {}

class VoiceEngineError extends Data.TaggedError("VoiceEngineError")<{
  readonly detail: string;
}> {}

export type VoiceFailure =
  | VoiceModelsMissingError
  | VoiceRuntimeUnavailableError
  | VoiceEngineError;

export type VoiceComponentState =
  | { readonly state: "ready" }
  | { readonly state: "idle" }
  | { readonly state: "missing_models"; readonly detail: string }
  | { readonly state: "unavailable"; readonly detail: string };

export interface VoiceStatus {
  readonly voiceDir: string;
  readonly stt: VoiceComponentState;
  readonly tts: VoiceComponentState;
}

export interface TranscriptionResult {
  readonly text: string;
  readonly rawText: string;
  readonly audioMs: number;
  readonly decodeMs: number;
}

export interface SpeechResult {
  readonly wav: Uint8Array;
  readonly spokenText: string;
  readonly synthMs: number;
}

interface VoiceSettings {
  readonly phraseBook: PhraseBook;
  readonly ttsSpeakerId: number;
  readonly ttsSpeed: number;
}

const DEFAULT_SETTINGS: VoiceSettings = {
  phraseBook: EMPTY_PHRASE_BOOK,
  ttsSpeakerId: 0,
  ttsSpeed: 1,
};

export class VoiceEngine extends Context.Service<
  VoiceEngine,
  {
    readonly voiceDir: string;
    readonly status: Effect.Effect<VoiceStatus>;
    readonly transcribe: (
      samples: Float32Array,
      sampleRate: number,
    ) => Effect.Effect<TranscriptionResult, VoiceFailure>;
    /** None when the reply has nothing worth saying (it was all code, say). */
    readonly speak: (markdown: string) => Effect.Effect<Option.Option<SpeechResult>, VoiceFailure>;
  }
>()("t3/voice/voiceEngine") {}

const errorDetail = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

const decodeSettingsJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));

/** Decodes voice.json leniently: bad fields fall back to defaults instead of disabling voice. */
export function parseVoiceSettings(input: unknown): VoiceSettings {
  if (typeof input !== "object" || input === null) return DEFAULT_SETTINGS;
  const record = input as Record<string, unknown>;
  const tts =
    typeof record.tts === "object" && record.tts !== null
      ? (record.tts as Record<string, unknown>)
      : {};
  return {
    phraseBook: parsePhraseBook(record),
    ttsSpeakerId:
      typeof tts.speakerId === "number" && tts.speakerId >= 0 ? Math.floor(tts.speakerId) : 0,
    ttsSpeed: typeof tts.speed === "number" && tts.speed >= 0.5 && tts.speed <= 2 ? tts.speed : 1,
  };
}

/**
 * Picks a model file. Prefers int8 weights when both precisions are present: same accuracy
 * class for dictation, a fraction of the memory.
 */
function pickModelFile(
  names: ReadonlyArray<string>,
  matches: (name: string) => boolean,
): string | undefined {
  const candidates = names.filter(matches).sort();
  return candidates.find((name) => name.includes("int8")) ?? candidates[0];
}

export const resolveParakeetConfig = Effect.fn("voice.resolveParakeetConfig")(function* (
  modelDir: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const names = yield* fs
    .readDirectory(modelDir)
    .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
  const onnx = (prefix: string) => (name: string) =>
    name.startsWith(prefix) && name.endsWith(".onnx");
  const encoder = pickModelFile(names, onnx("encoder"));
  const decoder = pickModelFile(names, onnx("decoder"));
  const joiner = pickModelFile(names, onnx("joiner"));
  if (!encoder || !decoder || !joiner || !names.includes("tokens.txt")) {
    return yield* new VoiceModelsMissingError({
      detail: `Parakeet model not found in ${modelDir} (need encoder, decoder, joiner .onnx and tokens.txt).`,
    });
  }
  return {
    featConfig: { sampleRate: VOICE_STT_SAMPLE_RATE, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: path.join(modelDir, encoder),
        decoder: path.join(modelDir, decoder),
        joiner: path.join(modelDir, joiner),
      },
      tokens: path.join(modelDir, "tokens.txt"),
      modelType: "nemo_transducer",
      numThreads: MODEL_THREADS,
      provider: "cpu",
      debug: 0,
    },
  };
});

export const resolveKokoroConfig = Effect.fn("voice.resolveKokoroConfig")(function* (
  modelDir: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const names = yield* fs
    .readDirectory(modelDir)
    .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
  const model = pickModelFile(names, (name) => name.endsWith(".onnx"));
  if (!model || !names.includes("voices.bin") || !names.includes("tokens.txt")) {
    return yield* new VoiceModelsMissingError({
      detail: `Kokoro model not found in ${modelDir} (need a .onnx model, voices.bin and tokens.txt).`,
    });
  }
  const lexicons = names.filter((name) => /^lexicon.*\.txt$/.test(name)).sort();
  const lexicon = lexicons.find((name) => name.includes("us-en")) ?? lexicons[0];
  return {
    model: {
      kokoro: {
        model: path.join(modelDir, model),
        voices: path.join(modelDir, "voices.bin"),
        tokens: path.join(modelDir, "tokens.txt"),
        ...(lexicon ? { lexicon: path.join(modelDir, lexicon) } : {}),
        ...(names.includes("espeak-ng-data")
          ? { dataDir: path.join(modelDir, "espeak-ng-data") }
          : {}),
      },
      numThreads: MODEL_THREADS,
      provider: "cpu",
      debug: 0,
    },
    maxNumSentences: 1,
  };
});

export const loadSherpa = Effect.tryPromise({
  // CommonJS: its exports object arrives as `default` (named-export detection misses it).
  try: async () => {
    const module = await import("sherpa-onnx-node");
    return module.default ?? module;
  },
  catch: (cause) =>
    new VoiceRuntimeUnavailableError({
      detail: `sherpa-onnx-node could not be loaded: ${errorDetail(cause)}`,
    }),
});

export type SpeechRecognizer = Pick<
  OfflineRecognizer,
  "createStream" | "decodeAsync" | "getResult"
>;
export type SpeechSynthesizer = Pick<OfflineTts, "numSpeakers" | "generateAsync">;

/** The native runtime behind the engine, so tests can stand in models without sherpa. */
export class VoiceRuntime extends Context.Service<
  VoiceRuntime,
  {
    readonly createRecognizer: (
      config: unknown,
    ) => Effect.Effect<SpeechRecognizer, VoiceRuntimeUnavailableError | VoiceEngineError>;
    readonly createSynthesizer: (
      config: unknown,
    ) => Effect.Effect<SpeechSynthesizer, VoiceRuntimeUnavailableError | VoiceEngineError>;
  }
>()("t3/voice/voiceEngine/VoiceRuntime") {}

const layerSherpaRuntime = Layer.succeed(VoiceRuntime, {
  createRecognizer: Effect.fn("VoiceRuntime.createRecognizer")(function* (config: unknown) {
    const sherpa = yield* loadSherpa;
    return yield* Effect.tryPromise({
      try: () => sherpa.OfflineRecognizer.createAsync(config),
      catch: (cause) =>
        new VoiceEngineError({ detail: `Parakeet failed to load: ${errorDetail(cause)}` }),
    });
  }),
  createSynthesizer: Effect.fn("VoiceRuntime.createSynthesizer")(function* (config: unknown) {
    const sherpa = yield* loadSherpa;
    return yield* Effect.tryPromise({
      try: () => sherpa.OfflineTts.createAsync(config),
      catch: (cause) =>
        new VoiceEngineError({ detail: `Kokoro failed to load: ${errorDetail(cause)}` }),
    });
  }),
});

const componentState = (
  loaded: boolean,
  lastError: Option.Option<VoiceModelsMissingError | VoiceRuntimeUnavailableError>,
  probe: Effect.Effect<unknown, VoiceModelsMissingError>,
): Effect.Effect<VoiceComponentState> => {
  if (loaded) return Effect.succeed({ state: "ready" });
  if (Option.isSome(lastError) && lastError.value._tag === "VoiceRuntimeUnavailableError") {
    return Effect.succeed({ state: "unavailable", detail: lastError.value.detail });
  }
  return probe.pipe(
    Effect.as<VoiceComponentState>({ state: "idle" }),
    Effect.catchTags({
      VoiceModelsMissingError: (error) =>
        Effect.succeed<VoiceComponentState>({ state: "missing_models", detail: error.detail }),
    }),
  );
};

const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const runtime = yield* VoiceRuntime;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const voiceDir = process.env.T3CODE_VOICE_DIR ?? path.join(config.baseDir, "voice");
  const parakeetDir = path.join(voiceDir, "models", "parakeet");
  const kokoroDir = path.join(voiceDir, "models", "kokoro");
  const settingsPath = path.join(voiceDir, "voice.json");
  const timingsPath = path.join(config.logsDir, VOICE_TIMINGS_FILE);
  const recordTiming = (record: Parameters<typeof appendVoiceTiming>[1]) =>
    withServices(appendVoiceTiming(timingsPath, record));

  const withServices = <A, E>(
    effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
  ): Effect.Effect<A, E> =>
    effect.pipe(
      Effect.provideService(FileSystem.FileSystem, fs),
      Effect.provideService(Path.Path, path),
    );

  const recognizer = yield* Ref.make(Option.none<SpeechRecognizer>());
  const tts = yield* Ref.make(Option.none<SpeechSynthesizer>());
  const sttError = yield* Ref.make(
    Option.none<VoiceModelsMissingError | VoiceRuntimeUnavailableError>(),
  );
  const ttsError = yield* Ref.make(
    Option.none<VoiceModelsMissingError | VoiceRuntimeUnavailableError>(),
  );
  const settingsCache = yield* Ref.make(
    Option.none<{ readonly mtimeMs: number; readonly settings: VoiceSettings }>(),
  );
  // One permit each: loads are single-flight and one utterance decodes at a time per model,
  // while a long reply being synthesized never holds up dictation.
  const sttLock = yield* Semaphore.make(1);
  const ttsLock = yield* Semaphore.make(1);

  const loadModel = Effect.fn("voice.loadModel")(function* <M>(
    kind: "stt" | "tts",
    loaded: Ref.Ref<Option.Option<M>>,
    lastError: Ref.Ref<Option.Option<VoiceModelsMissingError | VoiceRuntimeUnavailableError>>,
    create: Effect.Effect<
      M,
      VoiceModelsMissingError | VoiceRuntimeUnavailableError | VoiceEngineError
    >,
  ) {
    const current = yield* Ref.get(loaded);
    if (Option.isSome(current)) return current.value;
    const started = performance.now();
    const model = yield* create.pipe(
      Effect.tapError((error) =>
        error._tag === "VoiceEngineError" ? Effect.void : Ref.set(lastError, Option.some(error)),
      ),
    );
    yield* Ref.set(loaded, Option.some(model));
    yield* Ref.set(lastError, Option.none());
    yield* recordTiming({ kind: "load", model: kind, ms: Math.round(performance.now() - started) });
    return model;
  });

  const loadRecognizer = loadModel(
    "stt",
    recognizer,
    sttError,
    Effect.gen(function* () {
      const modelConfig = yield* withServices(resolveParakeetConfig(parakeetDir));
      return yield* runtime.createRecognizer(modelConfig);
    }),
  );

  const loadTts = loadModel(
    "tts",
    tts,
    ttsError,
    Effect.gen(function* () {
      const modelConfig = yield* withServices(resolveKokoroConfig(kokoroDir));
      return yield* runtime.createSynthesizer(modelConfig);
    }),
  );

  const loadSettings: Effect.Effect<VoiceSettings> = Effect.gen(function* () {
    const info = yield* fs.stat(settingsPath).pipe(Effect.option);
    if (Option.isNone(info)) return DEFAULT_SETTINGS;
    const mtimeMs = Option.match(info.value.mtime, {
      onNone: () => 0,
      onSome: (date) => date.getTime(),
    });
    const cached = yield* Ref.get(settingsCache);
    if (Option.isSome(cached) && cached.value.mtimeMs === mtimeMs) return cached.value.settings;

    const parsed = yield* fs
      .readFileString(settingsPath)
      .pipe(Effect.flatMap(decodeSettingsJson), Effect.option);
    // A half-saved or invalid file should not break dictation; keep the last good settings.
    if (Option.isNone(parsed)) {
      return Option.isSome(cached) ? cached.value.settings : DEFAULT_SETTINGS;
    }
    const settings = parseVoiceSettings(parsed.value);
    yield* Ref.set(settingsCache, Option.some({ mtimeMs, settings }));
    return settings;
  });

  const status: Effect.Effect<VoiceStatus> = Effect.gen(function* () {
    const stt = yield* componentState(
      Option.isSome(yield* Ref.get(recognizer)),
      yield* Ref.get(sttError),
      withServices(resolveParakeetConfig(parakeetDir)),
    );
    const speech = yield* componentState(
      Option.isSome(yield* Ref.get(tts)),
      yield* Ref.get(ttsError),
      withServices(resolveKokoroConfig(kokoroDir)),
    );
    return { voiceDir, stt, tts: speech };
  });

  const transcribe = (samples: Float32Array, sampleRate: number) =>
    sttLock.withPermits(1)(
      Effect.gen(function* () {
        const model = yield* loadRecognizer;
        const settings = yield* loadSettings;
        const started = performance.now();
        const rawText = yield* Effect.tryPromise({
          try: async () => {
            const stream = model.createStream();
            stream.acceptWaveform({ samples, sampleRate });
            await model.decodeAsync(stream);
            return model.getResult(stream).text.trim();
          },
          catch: (cause) =>
            new VoiceEngineError({ detail: `Transcription failed: ${errorDetail(cause)}` }),
        });
        const result = {
          rawText,
          text: applyPhraseBook(rawText, settings.phraseBook),
          audioMs: Math.round((samples.length / sampleRate) * 1000),
          decodeMs: Math.round(performance.now() - started),
        } satisfies TranscriptionResult;
        yield* recordTiming({
          kind: "transcribe",
          audioMs: result.audioMs,
          decodeMs: result.decodeMs,
          chars: rawText.length,
        });
        return result;
      }),
    );

  const speak = (markdown: string) =>
    ttsLock.withPermits(1)(
      Effect.gen(function* () {
        const spokenText = toSpeakableText(markdown);
        if (spokenText.length === 0) return Option.none<SpeechResult>();
        const model = yield* loadTts;
        const settings = yield* loadSettings;
        const speakerId = Math.min(settings.ttsSpeakerId, Math.max(0, model.numSpeakers - 1));
        const started = performance.now();
        const audio = yield* Effect.tryPromise({
          try: () =>
            model.generateAsync({ text: spokenText, sid: speakerId, speed: settings.ttsSpeed }),
          catch: (cause) =>
            new VoiceEngineError({ detail: `Speech synthesis failed: ${errorDetail(cause)}` }),
        });
        const synthMs = Math.round(performance.now() - started);
        yield* recordTiming({
          kind: "speak",
          chars: spokenText.length,
          synthMs,
          audioMs: Math.round((audio.samples.length / audio.sampleRate) * 1000),
        });
        return Option.some<SpeechResult>({
          spokenText,
          wav: float32ToWav(audio.samples, audio.sampleRate),
          synthMs,
        });
      }),
    );

  return { voiceDir, status, transcribe, speak } satisfies VoiceEngine["Service"];
});

/** The engine over whatever runtime is provided; tests supply a fake. */
export const layerEngine = Layer.effect(VoiceEngine, make);

export const layer = layerEngine.pipe(Layer.provide(layerSherpaRuntime));
