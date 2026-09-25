import { useCallback, useEffect, useRef, useState } from "react";

import { fetchCommand } from "@/lib/door";
import type { CommandStatus, DeviceCommand } from "@/types";

const POLL_MS = 250;
const ERROR_RETRY_MS = 500;
const FINISHED: ReadonlyArray<CommandStatus> = ["succeeded", "failed", "expired", "cancelled"];

export function isFinished(status: CommandStatus): boolean {
  return FINISHED.includes(status);
}

interface Tracked {
  id: string;
  status: CommandStatus;
}

// `current` is the status the UI shows now — a fetcher that waits on the
// server (see fetchUnlock) returns as soon as it changes.
type Fetcher<T> = (id: string, current: CommandStatus) => Promise<T>;

interface TrackerOptions {
  // Pause between requests. 0 for a fetcher that waits on the server itself.
  pollMs?: number;
}

// Follows one door command (unlock / enrollment) until it finishes, so the
// UI can show "waiting for the door → place finger → lift → again → done".
// `fetcher` defaults to the admin endpoint; the keypad app passes its own.
export function useCommandTracker<T extends Tracked = DeviceCommand>(
  fetcher: Fetcher<T> = fetchCommand as unknown as Fetcher<T>,
  { pollMs = POLL_MS }: TrackerOptions = {},
) {
  const [command, setCommand] = useState<T | null>(null);
  const activeId = command !== null && !isFinished(command.status) ? command.id : null;

  // Latest status, readable from the polling loop without restarting it.
  const statusRef = useRef<CommandStatus>("pending");
  useEffect(() => {
    if (command !== null) statusRef.current = command.status;
  }, [command]);

  useEffect(() => {
    if (activeId === null) return;

    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      let delay = pollMs;
      try {
        const next = await fetcher(activeId, statusRef.current);
        if (!cancelled) {
          statusRef.current = next.status;
          setCommand(next);
        }
      } catch {
        // Network blip — keep polling (with a pause, so a fetcher that waits
        // on the server can't spin); the backend expires stuck commands.
        delay = Math.max(pollMs, ERROR_RETRY_MS);
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), delay);
    };

    timer = window.setTimeout(() => void poll(), pollMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeId, fetcher, pollMs]);

  const reset = useCallback(() => setCommand(null), []);

  return { command, track: setCommand, reset };
}
