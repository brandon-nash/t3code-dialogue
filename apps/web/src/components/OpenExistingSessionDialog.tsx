import { useAtomValue } from "@effect/atom-react";
import { useRouter } from "@tanstack/react-router";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { AgentSessionListItem, ScopedProjectRef, ThreadId } from "@t3tools/contracts";
import { RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { create } from "zustand";

import { useNowMinute } from "../hooks/useNowMinute";
import { agentSessionImport, agentSessionList } from "../state/agentSessions";
import { useProject } from "../state/entities";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { buildThreadRouteParams } from "../threadRoutes";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Spinner } from "./ui/spinner";

const useRequest = create<{ projectRef: ScopedProjectRef | null }>(() => ({ projectRef: null }));

/** Opens the picker that continues a Claude Code session started outside T3 as a thread. */
export function openExistingSessionPicker(projectRef: ScopedProjectRef) {
  useRequest.setState({ projectRef });
}

const close = () => useRequest.setState({ projectRef: null });

export function OpenExistingSessionDialogHost() {
  const projectRef = useRequest((state) => state.projectRef);
  const project = useProject(projectRef);
  return projectRef && project ? (
    <OpenExistingSessionDialog projectRef={projectRef} projectTitle={project.title} />
  ) : null;
}

function OpenExistingSessionDialog({
  projectRef,
  projectTitle,
}: {
  readonly projectRef: ScopedProjectRef;
  readonly projectTitle: string;
}) {
  const router = useRouter();
  const sessions = useEnvironmentQuery(
    agentSessionList({
      environmentId: projectRef.environmentId,
      input: { projectId: projectRef.projectId },
    }),
  );
  const canImport = useAtomValue(agentSessionImport.permissionAtom(projectRef.environmentId));
  const importSession = useAtomCommand(agentSessionImport, { reportFailure: false });
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nowMs = Date.parse(`${useNowMinute()}:00.000Z`);

  const openThread = (threadId: ThreadId) => {
    close();
    void router.navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(projectRef.environmentId, threadId)),
    });
  };

  const importOne = async (session: AgentSessionListItem) => {
    setImporting(session.providerSessionId);
    setError(null);
    const result = await importSession({
      environmentId: projectRef.environmentId,
      input: { projectId: projectRef.projectId, sessionIds: [session.providerSessionId] },
    });
    setImporting(null);
    if (result._tag === "Success") {
      const threadId = result.value.threadIds?.[0];
      if (threadId !== undefined) {
        openThread(threadId);
        return;
      }
      setError("This session could not be imported. It may be owned by another thread.");
      sessions.refresh();
      return;
    }
    if (isAtomCommandInterrupted(result)) return;
    const failure = squashAtomCommandFailure(result);
    setError(failure instanceof Error ? failure.message : "Could not import the session.");
  };

  const list = sessions.data?.sessions ?? [];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && importing === null) close();
      }}
    >
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Open existing session</DialogTitle>
          <DialogDescription>
            Claude Code sessions started in {projectTitle} outside T3 Code. Importing one continues
            it here; finish it in the terminal first, since both would write to the same transcript.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">
              {sessions.isPending && list.length === 0
                ? "Looking for sessions…"
                : list.length === 0
                  ? "No sessions found in the last 30 days."
                  : `${list.length} ${list.length === 1 ? "session" : "sessions"}`}
            </span>
            <Button
              type="button"
              variant="ghost-muted"
              size="xs"
              disabled={sessions.isPending}
              onClick={() => sessions.refresh()}
            >
              <RefreshCwIcon className="size-3.5" />
              Refresh
            </Button>
          </div>
          {sessions.error ? (
            <p className="text-destructive-foreground text-sm">{sessions.error}</p>
          ) : null}
          {list.length > 0 ? (
            <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
              {list.map((session) => (
                <SessionRow
                  key={`${session.providerInstanceId}:${session.providerSessionId}`}
                  session={session}
                  nowMs={nowMs}
                  busy={importing !== null}
                  importing={importing === session.providerSessionId}
                  canImport={canImport}
                  onOpen={openThread}
                  onImport={() => void importOne(session)}
                />
              ))}
            </ul>
          ) : null}
          {!canImport && list.some((session) => session.threadId === undefined) ? (
            <p className="text-muted-foreground text-xs">
              You do not have permission to import sessions on this environment.
            </p>
          ) : null}
          {error ? <p className="text-destructive-foreground text-sm">{error}</p> : null}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

function SessionRow({
  session,
  nowMs,
  busy,
  importing,
  canImport,
  onOpen,
  onImport,
}: {
  readonly session: AgentSessionListItem;
  readonly nowMs: number;
  readonly busy: boolean;
  readonly importing: boolean;
  readonly canImport: boolean;
  readonly onOpen: (threadId: ThreadId) => void;
  readonly onImport: () => void;
}) {
  const title = session.title.trim() === "" ? "Untitled session" : session.title;
  const meta = [
    formatRelativeTimeLabel(session.updatedAt, nowMs),
    `${session.messageCount} ${session.messageCount === 1 ? "message" : "messages"}`,
    ...(session.model ? [session.model] : []),
  ]
    .filter((part) => part !== "")
    .join(" · ");
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{title}</span>
        <span className="truncate text-muted-foreground text-xs">{meta}</span>
      </div>
      {session.threadId !== undefined ? (
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={busy}
          onClick={() => onOpen(session.threadId!)}
          aria-label={`Open ${title}`}
        >
          Open
        </Button>
      ) : (
        <Button
          type="button"
          size="xs"
          disabled={busy || !canImport}
          onClick={onImport}
          aria-label={`Import ${title}`}
        >
          {importing ? <Spinner className="size-3.5" /> : null}
          Import
        </Button>
      )}
    </li>
  );
}
