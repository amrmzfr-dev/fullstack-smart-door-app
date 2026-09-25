import { useCallback, useState } from "react";

import { usePolling } from "@/hooks/usePolling";
import { fetchDoorStatus, fetchEvents, fetchMembers } from "@/lib/door";
import type { AccessEvent, DoorStatus, Member } from "@/types";

const STATUS_POLL_MS = 2000; // matches the door's heartbeat interval
const EVENTS_POLL_MS = 4000;

export function useDoorStatus() {
  const [status, setStatus] = useState<DoorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchDoorStatus());
      setError(null);
    } catch {
      setError("Couldn't reach the server");
    }
  }, []);

  usePolling(refresh, STATUS_POLL_MS);
  return { status, error, refresh };
}

export function useEvents() {
  const [events, setEvents] = useState<AccessEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setEvents(await fetchEvents());
    } catch {
      // Keep showing the last list; the status card already shows the outage.
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(refresh, EVENTS_POLL_MS);
  return { events, loading, refresh };
}

// Members only change when someone edits them here (or an enrollment
// finishes), so no background polling — callers reload after each change.
export function useMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setMembers(await fetchMembers());
      setError(null);
    } catch {
      setError("Couldn't load people");
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(reload, 30000);
  return { members, loading, error, reload };
}
