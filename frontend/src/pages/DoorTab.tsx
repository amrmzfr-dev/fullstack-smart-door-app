import { Cpu, DoorClosed, DoorOpen, FingerprintPattern, Lock, LockOpen, Siren } from "lucide-react";

import { EventRow } from "@/components/EventRow";
import { SectionHeading } from "@/components/SectionLabel";
import { StatusCard, type StatusTone } from "@/components/StatusCard";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/useNow";
import { describeEvent, isAlarm } from "@/lib/events";
import { formatAgo } from "@/lib/format";
import type { AccessEvent, DoorStatus } from "@/types";

const RECENT_COUNT = 6;
const ALARM_BANNER_MS = 10 * 60 * 1000;

interface DoorTabProps {
  status: DoorStatus | null;
  events: AccessEvent[];
  eventsLoading: boolean;
  onViewLog: () => void;
}

interface CardState {
  value: string;
  tone: StatusTone;
}

// While the controller is offline its last reported state may be stale, so
// the value is shown but the dot goes grey.
function stateCard(known: boolean | null, online: boolean, whenTrue: CardState, whenFalse: CardState): CardState {
  if (known === null) return { value: "—", tone: "unknown" };
  const state = known ? whenTrue : whenFalse;
  return online ? state : { ...state, tone: "unknown" };
}

export function DoorTab({ status, events, eventsLoading, onViewLog }: DoorTabProps) {
  const now = useNow();
  const online = status?.online ?? false;
  const door = stateCard(
    status?.doorOpen ?? null,
    online,
    { value: "Open", tone: "warn" },
    { value: "Closed", tone: "good" },
  );
  const lock = stateCard(
    status?.locked ?? null,
    online,
    { value: "Locked", tone: "good" },
    { value: "Unlocked", tone: "warn" },
  );
  const sensor = stateCard(
    status?.fingerprintReady ?? null,
    online,
    { value: "Ready", tone: "good" },
    { value: "Not found", tone: "bad" },
  );

  const controllerDetail = online
    ? [status?.firmwareVersion && `Firmware ${status.firmwareVersion}`, status?.ipAddress].filter(Boolean).join(" · ")
    : status?.lastSeenAt
      ? `Last seen ${formatAgo(status.lastSeenAt, now)}`
      : "Never connected";

  const latestAlarm = events.find(isAlarm);
  const showAlarm = latestAlarm !== undefined && now - new Date(latestAlarm.occurredAt).getTime() < ALARM_BANNER_MS;

  const recent = events.filter((event) => event.type !== "door_opened" && event.type !== "door_closed").slice(0, RECENT_COUNT);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionHeading label="Door" title="Live status" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatusCard
            label="Door"
            icon={status?.doorOpen ? DoorOpen : DoorClosed}
            value={door.value}
            tone={door.tone}
            detail="Magnetic door contact"
          />
          <StatusCard
            label="Lock"
            icon={status?.locked === false ? LockOpen : Lock}
            value={lock.value}
            tone={lock.tone}
            detail="Magnetic lock relay"
          />
          <StatusCard
            label="Controller"
            icon={Cpu}
            value={status === null ? "—" : online ? "Online" : "Offline"}
            tone={status === null ? "unknown" : online ? "good" : "bad"}
            detail={controllerDetail || "Reporting"}
          />
          <StatusCard
            label="Fingerprint"
            icon={FingerprintPattern}
            value={sensor.value}
            tone={sensor.tone}
            detail={status?.templateCount != null ? `${status.templateCount} stored on sensor` : "AS608 sensor"}
          />
        </div>
      </section>

      {/* No unlock button here on purpose: the door only opens with a PIN or
          fingerprint (on the door, or on the keypad app at "/"). */}
      {showAlarm && latestAlarm && (
        <div className="flex items-center gap-3 rounded-[16px] border border-destructive/40 bg-destructive/10 p-3 text-destructive">
          <Siren className="size-5 flex-none" />
          <div className="min-w-0">
            <p className="text-sm font-bold">{describeEvent(latestAlarm).title}</p>
            <p className="text-xs opacity-80">{formatAgo(latestAlarm.occurredAt, now)}</p>
          </div>
        </div>
      )}

      <div>
        <section className="space-y-3">
          <SectionHeading label="Activity" title="Who came in">
            <Button variant="outline" size="sm" onClick={onViewLog}>
              Full log
            </Button>
          </SectionHeading>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {eventsLoading ? "Loading activity…" : "Nothing yet — PIN, fingerprint and exit-button use shows up here."}
            </p>
          ) : (
            <div className="space-y-2">
              {recent.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
