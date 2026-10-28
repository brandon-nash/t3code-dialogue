import * as Schema from "effect/Schema";

import { useLocalStorage } from "../hooks/useLocalStorage";

/** Whether this browser reads completed replies aloud. Per browser, like the speaker button. */
export function useVoiceRepliesEnabled() {
  return useLocalStorage("t3code.voiceRepliesEnabled", false, Schema.Boolean);
}
