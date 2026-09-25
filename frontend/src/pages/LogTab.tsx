import { useState } from "react";

import { EventRow } from "@/components/EventRow";
import { SectionHeading, SectionLabel } from "@/components/SectionLabel";
import { describeEvent, type EventCategory } from "@/lib/events";
import { dayKey, formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccessEvent } from "@/types";

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

export function LogTab({ events, loading }: { events: AccessEvent[]; loading: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = filter === "all" ? events : events.filter((event) => describeEvent(event).category === filter);
  const groups = groupByDay(filtered);

  return (
    <div className="space-y-4">
      <SectionHeading label="Log" title="Everything the door saw" />

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
