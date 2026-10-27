import type {
  MessageId,
  OrchestrationV2ConversationMessage,
  OrchestrationV2RunStatus,
  RunId,
} from "@t3tools/contracts";

const TERMINAL_RUN_STATUSES: ReadonlySet<OrchestrationV2RunStatus> = new Set([
  "completed",
  "interrupted",
  "failed",
  "cancelled",
  "rolled_back",
]);

interface RunSnapshot {
  readonly runId: RunId;
  readonly status: OrchestrationV2RunStatus;
}

/**
 * Decides which finished runs get read aloud: each run at most once, only runs that finish
 * while the thread is open (never the reply that was already there when it opened), and only
 * runs that completed. A run that finishes while replies are muted is consumed, so turning
 * replies on later does not suddenly read out an old answer.
 */
export function createSpokenRunTracker() {
  const handled = new Set<RunId>();
  let seeded = false;

  return {
    observe(run: RunSnapshot | null, enabled: boolean): RunId | null {
      if (!seeded) {
        seeded = true;
        if (run && TERMINAL_RUN_STATUSES.has(run.status)) handled.add(run.runId);
        return null;
      }
      if (!run || !TERMINAL_RUN_STATUSES.has(run.status) || handled.has(run.runId)) return null;
      handled.add(run.runId);
      return enabled && run.status === "completed" ? run.runId : null;
    },
  };
}

type ReplyMessage = Pick<
  OrchestrationV2ConversationMessage,
  "id" | "role" | "runId" | "text" | "streaming"
>;

/**
 * The reply to read for a run: the run's own final assistant message when the summary names
 * it, otherwise the last assistant message of the run. Earlier assistant messages in a run are
 * usually narration ("Let me look at the tests") rather than the answer.
 */
export function pickSpokenReply(
  messages: ReadonlyArray<ReplyMessage>,
  runId: RunId,
  assistantMessageId: MessageId | null,
): ReplyMessage | null {
  if (assistantMessageId !== null) {
    const named = messages.find((message) => message.id === assistantMessageId);
    if (named && named.role === "assistant") return named;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant" && message.runId === runId) return message;
  }
  return null;
}
