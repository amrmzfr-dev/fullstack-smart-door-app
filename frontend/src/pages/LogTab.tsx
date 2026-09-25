import { useState } from "react";

import { EventRow } from "@/components/EventRow";
import { SectionHeading, SectionLabel } from "@/components/SectionLabel";
import { describeEvent, type EventCategory } from "@/lib/events";
import { dayKey, formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccessEvent, Door } from "@/types";

type Filter = "all" | EventCategory;

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "access", label: "Access" },
  { key: "alarm", label: "Alarms" },
  { key: "door", label: "Door" },
];

interface DayGroup {
  key: string;
  label: string;
  items: AccessEvent[];
}

// `events` arrive newest-first, so one pass keeps that order and only starts
// a new group when the calendar day changes.
function groupByDay(events: AccessEvent[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const event of events) {
    const key = dayKey(event.occurredAt);
    const current = groups[groups.length - 1];
    if (current && current.key === key) {
      current.items.push(event);
    } else {
      groups.push({ key, label: formatDay(event.occurredAt), items: [event] });
    }
  }
  return groups;
}

interface LogTabProps {
  events: AccessEvent[];
  doors: Door[];
  loading: boolean;
}

export function LogTab({ events, doors, loading }: LogTabProps) {
  const [filter, setFilter] = useState<Filter>("all");
  // "all" or one door's ID.
  const [doorFilter, setDoorFilter] = useState("all");

  const filtered = events.filter(
    (event) =>
      (filter === "all" || describeEvent(event).category === filter) &&
      (doorFilter === "all" || event.doorId === doorFilter),
  );
  const groups = groupByDay(filtered);

  return (
    <div className="space-y-4">
      <SectionHeading label="Log" title="Everything the doors saw">
        {doors.length > 1 && (
          <select
            value={doorFilter}
            onChange={(event) => setDoorFilter(event.target.value)}
            aria-label="Filter by door"
            className="h-8 rounded-lg border border-border bg-card px-2 text-sm text-foreground"
          >
            <option value="all">All doors</option>
            {doors.map((door) => (
              <option key={door.id} value={door.id}>
                {door.name}
              </option>
            ))}
          </select>
        )}
      </SectionHeading>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-full border px-3 py-1.5 font-mono text-[10px] font-medium tracking-[.12em] uppercase transition-colors",
              filter === key
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {loading ? "Loading events…" : events.length === 0 ? "Nothing recorded yet" : "Nothing matches this filter"}
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.key} className="space-y-2">
              <SectionLabel>{group.label}</SectionLabel>
              <div className="space-y-2">
                {group.items.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
