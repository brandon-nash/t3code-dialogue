// @effect-diagnostics nodeBuiltinImport:off globalConsole:off
// Prints p50/p90/max for voice model loads, transcription, and synthesis from the server's
// voice-timings.ndjson.
//
//   node scripts/voice/summarize-timings.ts [path]   default: ~/.t3/dev/logs/voice-timings.ndjson
//
// The installed app writes to ~/.t3/userdata/logs; a worktree dev server to <worktree>/.t3/logs.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { renderVoiceTimingSummary, summarizeVoiceTimings } from "./timings.ts";

const file =
  process.argv[2] ?? NodePath.join(NodeOS.homedir(), ".t3", "dev", "logs", "voice-timings.ndjson");

if (!NodeFS.existsSync(file)) {
  console.error(`No timings file at ${file}. Use voice for a while, then pass the file's path.`);
  process.exit(1);
}

console.log(`Voice timings from ${file}\n`);
console.log(
  renderVoiceTimingSummary(summarizeVoiceTimings(NodeFS.readFileSync(file, "utf8").split("\n"))),
);
