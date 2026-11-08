import { useEffect, useState } from "react";

import { EventRow } from "@/components/EventRow";
import { Modal } from "@/components/Modal";
import { fetchMemberEvents } from "@/lib/door";
import { dayKey, formatDay } from "@/lib/format";
import type { AccessEvent, Member } from "@/types";

// One person's recent history: every time they opened a door, were turned
// away, or signed in.
export function MemberHistoryDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const [events, setEvents] = useState<AccessEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMemberEvents(member.id, 200)
      .then((result) => {
        if (!cancelled) setEvents(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  const opened = events?.filter((event) => event.type === "granted").length ?? 0;
  const denied = events?.filter((event) => event.type === "denied" || event.type === "sign_in_failed").length ?? 0;

  let lastDay = "";
  return (
    <Modal
      title={`${member.name} — history`}
      subtitle={events ? `${opened} opened · ${denied} turned away (latest ${events.length} entries)` : undefined}
      onClose={onClose}
      className="max-w-lg"
    >
      {failed && <p className="text-sm text-destructive">Couldn't load the history.</p>}
      {!failed && events === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {events?.length === 0 && <p className="text-sm text-muted-foreground">Nothing recorded for this person yet.</p>}
      <div className="space-y-2">
        {events?.map((event) => {
          const key = dayKey(event.occurredAt);
          const showDay = key !== lastDay;
          lastDay = key;
          return (
            <div key={event.id} className="space-y-2">
              {showDay && (
                <p className="pt-2 font-mono text-[10px] tracking-[.14em] text-muted-foreground uppercase">
                  {formatDay(event.occurredAt)}
                </p>
              )}
              <EventRow event={event} />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
