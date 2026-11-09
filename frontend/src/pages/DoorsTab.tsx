import { useEffect, useState } from "react";
import { Plus, Siren } from "lucide-react";

import { DoorCard } from "@/components/DoorCard";
import { DoorNameDialog } from "@/components/DoorNameDialog";
import { DoorSetupDialog } from "@/components/DoorSetupDialog";
import { EventList, EventRow } from "@/components/EventRow";
import { SectionHeading } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/useNow";
import { createDoor } from "@/lib/door";
import { describeEvent, isAlarm } from "@/lib/events";
import { formatAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccessEvent, Door, DoorSetup } from "@/types";

const RECENT_COUNT = 6;
const ALARM_BANNER_MS = 10 * 60 * 1000;
const NOTICE_MS = 4000;

interface Notice {
  tone: "success" | "error";
  text: string;
}

interface DoorsTabProps {
  doors: Door[];
  loaded: boolean;
  events: AccessEvent[];
  eventsLoading: boolean;
  onViewLog: () => void;
  onDoorsChanged: () => void;
}

// Every door: live state, its PIN and settings, plus recent activity. No
// unlock button here on purpose — doors only open with a PIN or fingerprint.
export function DoorsTab({ doors, loaded, events, eventsLoading, onViewLog, onDoorsChanged }: DoorsTabProps) {
  const now = useNow();
  const [adding, setAdding] = useState(false);
  const [setup, setSetup] = useState<DoorSetup | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const latestAlarm = events.find(isAlarm);
  const showAlarm = latestAlarm !== undefined && now - new Date(latestAlarm.occurredAt).getTime() < ALARM_BANNER_MS;
  const recent = events.filter((event) => event.type !== "door_opened" && event.type !== "door_closed").slice(0, RECENT_COUNT);

  return (
    <div className="space-y-6">
      {showAlarm && latestAlarm && (
        <div className="flex items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-destructive">
          <Siren className="size-5 flex-none" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {describeEvent(latestAlarm).title}
              {latestAlarm.doorName && ` · ${latestAlarm.doorName}`}
            </p>
            <p className="text-xs opacity-80">{formatAgo(latestAlarm.occurredAt, now)}</p>
          </div>
        </div>
      )}

      <section className="space-y-3">
        <SectionHeading label="Doors" title="Every door, live">
          <Button variant="ink" onClick={() => setAdding(true)}>
            <Plus />
            Add door
          </Button>
        </SectionHeading>

        {notice && (
          <p
            className={cn(
              "rounded-[12px] px-3 py-2 text-sm",
              notice.tone === "success" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
            )}
          >
            {notice.text}
          </p>
        )}

        {doors.length === 0 ? (
          <p className="text-sm text-muted-foreground">{loaded ? "No doors yet — add one." : "Loading doors…"}</p>
        ) : (
          <div className="space-y-4">
            {doors.map((door) => (
              <DoorCard
                key={door.id}
                door={door}
                now={now}
                onChanged={onDoorsChanged}
                onNotice={(tone, text) => setNotice({ tone, text })}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Who came in</h3>
          <button type="button" onClick={onViewLog} className="text-[13px] text-muted-foreground">
            See all
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {eventsLoading ? "Loading activity…" : "Nothing yet — PIN, fingerprint and exit-button use shows up here."}
          </p>
        ) : (
          <EventList>
            {recent.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </EventList>
        )}
      </section>

      {adding && (
        <DoorNameDialog
          title="Add a door"
          subtitle="Then flash its controller with the settings shown next"
          submitLabel="Add door"
          onClose={() => setAdding(false)}
          onSubmit={async (name) => {
            const created = await createDoor(name);
            setAdding(false);
            setSetup(created);
            onDoorsChanged();
          }}
        />
      )}

      {setup && <DoorSetupDialog setup={setup} onClose={() => setSetup(null)} />}
    </div>
  );
}
