import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";

import { Switch } from "@/components/Switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { setDoorSchedule } from "@/lib/door";
import { cn } from "@/lib/utils";
import type { Door, DoorSchedule } from "@/types";

// Day numbers match the backend: 0 = Monday ... 6 = Sunday.
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

interface DoorScheduleCardProps {
  door: Door;
  onChanged: () => void;
  onNotice: (tone: "success" | "error", text: string) => void;
}

function sameSchedule(a: DoorSchedule, b: DoorSchedule): boolean {
  return a.enabled === b.enabled && a.from === b.from && a.until === b.until && a.days.join() === b.days.join();
}

function formatTime(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function describeDays(days: number[]): string {
  if (days.length === 7) return "every day";
  if (days.join() === "0,1,2,3,4") return "Monday to Friday";
  if (days.length === 0) return "no days";
  return days.map((day) => DAYS[day]).join(", ");
}

// Open hours for one door: unlocked from..until on the chosen days, locked the
// rest of the time (then PIN / fingerprint / phone as usual). The controller
// keeps the hours itself, so they still work if it loses the internet.
export function DoorScheduleCard({ door, onChanged, onNotice }: DoorScheduleCardProps) {
  const saved = door.schedule;
  const [draft, setDraft] = useState<DoorSchedule>(saved);
  const [busy, setBusy] = useState(false);

  // Pick up changes saved elsewhere (or just now).
  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const dirty = !sameSchedule(draft, saved);
  const invalid = draft.from >= draft.until || (draft.enabled && draft.days.length === 0);

  const toggleDay = (day: number) => {
    setDraft((current) => ({
      ...current,
      days: current.days.includes(day) ? current.days.filter((d) => d !== day) : [...current.days, day].sort((a, b) => a - b),
    }));
  };

  const save = async () => {
    setBusy(true);
    try {
      await setDoorSchedule(door.id, draft);
      onNotice(
        "success",
        draft.enabled
          ? `${door.name} will stay unlocked ${formatTime(draft.from)} to ${formatTime(draft.until)}, ${describeDays(draft.days)}`
          : `${door.name} open hours turned off`,
      );
      onChanged();
    } catch (err) {
      onNotice("error", errorMessage(err, "Could not save the open hours. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-[14px] bg-secondary/60 p-3">
      <div className="flex items-center gap-3">
        <CalendarClock className="size-4 flex-none text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Open hours</p>
          <p className="truncate text-xs text-muted-foreground">
            {saved.enabled
              ? `Unlocked ${formatTime(saved.from)} – ${formatTime(saved.until)}, ${describeDays(saved.days)}. Locked otherwise.`
              : "Off — the door only opens with a PIN, fingerprint or phone."}
          </p>
        </div>
        <Switch
          label={`Open hours for ${door.name}`}
          checked={draft.enabled}
          disabled={busy}
          onChange={(enabled) => setDraft((current) => ({ ...current, enabled }))}
        />
      </div>

      <div className={cn("space-y-3", !draft.enabled && "opacity-60")}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Unlocks at
            <Input
              type="time"
              value={draft.from}
              disabled={busy}
              onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
              className="w-32"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-muted-foreground">
            Locks at
            <Input
              type="time"
              value={draft.until}
              disabled={busy}
              onChange={(event) => setDraft((current) => ({ ...current, until: event.target.value }))}
              className="w-32"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days the door is unlocked">
          {DAYS.map((label, day) => {
            const on = draft.days.includes(day);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                disabled={busy}
                onClick={() => toggleDay(day)}
                className={cn(
                  "h-8 min-w-12 rounded-lg border px-2.5 text-xs font-bold transition-colors disabled:opacity-50",
                  on
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-secondary",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {draft.from >= draft.until && <p className="text-xs text-destructive">It must lock later than it unlocks.</p>}
      {draft.enabled && draft.days.length === 0 && <p className="text-xs text-destructive">Pick at least one day.</p>}

      <div className="flex justify-end gap-2">
        {dirty && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDraft(saved)}>
            Undo
          </Button>
        )}
        <Button size="sm" disabled={busy || !dirty || invalid} onClick={() => void save()}>
          Save hours
        </Button>
      </div>
    </div>
  );
}
