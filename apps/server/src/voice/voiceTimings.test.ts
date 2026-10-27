import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { appendVoiceTiming } from "./voiceTimings.ts";

it.effect("appends one JSON line per record and creates the logs directory", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-voice-timings-" });
    const file = path.join(dir, "logs", "voice-timings.ndjson");

    yield* appendVoiceTiming(file, { kind: "load", model: "stt", ms: 1200 });
    yield* appendVoiceTiming(file, { kind: "transcribe", audioMs: 2000, decodeMs: 150, chars: 40 });

    const lines = (yield* fs.readFileString(file))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ kind: "load", model: "stt", ms: 1200 });
    expect(lines[1]).toMatchObject({ kind: "transcribe", audioMs: 2000, decodeMs: 150, chars: 40 });
    expect(typeof lines[0].at).toBe("string");
  }).pipe(Effect.provide(NodeServices.layer)),
);
