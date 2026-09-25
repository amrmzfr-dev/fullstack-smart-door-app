import { useCallback, useEffect, useState } from "react";

import { fetchCommand } from "@/lib/door";
import type { CommandStatus, DeviceCommand } from "@/types";

const POLL_MS = 250;
const FINISHED: ReadonlyArray<CommandStatus> = ["succeeded", "failed", "expired", "cancelled"];

export function isFinished(status: CommandStatus): boolean {
  return FINISHED.includes(status);
}

interface Tracked {
  id: string;
  status: CommandStatus;
}

// Follows one door command (unlock / enrollment) until it finishes, so the
// UI can show "waiting for the door → place finger → lift → again → done".
// `fetcher` defaults to the admin endpoint; the keypad app passes its own.
export function useCommandTracker<T extends Tracked = DeviceCommand>(
  fetcher: (id: string) => Promise<T> = fetchCommand as unknown as (id: string) => Promise<T>,
) {
  const [command, setCommand] = useState<T | null>(null);
  const activeId = command !== null && !isFinished(command.status) ? command.id : null;

  useEffect(() => {
    if (activeId === null) return;

    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const next = await fetcher(activeId);
        if (!cancelled) setCommand(next);
      } catch {
        // Network blip — keep polling; the backend expires stuck commands.
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), POLL_MS);
    };

    timer = window.setTimeout(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeId, fetcher]);

  const reset = useCallback(() => setCommand(null), []);

  return { command, track: setCommand, reset };
}
