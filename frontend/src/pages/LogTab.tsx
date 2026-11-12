import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";

import { EventList, EventRow } from "@/components/EventRow";
import { SectionHeading, SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { METHOD_LABELS, TYPE_LABELS, describeEvent } from "@/lib/events";
import { dayKey, formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccessEvent, AccessMethod, Door } from "@/types";

type Range = "today" | "7d" | "30d" | "all";

const RANGES: ReadonlyArray<{ key: Range; label: string }> = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All loaded" },
];

const SELECT_CLASS =
  "h-[38px] min-w-0 rounded-[10px] border border-border bg-card px-2 text-[12.5px] text-foreground outline-none focus:border-primary";

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

function rangeStart(range: Range): number {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  switch (range) {
    case "today":
      return startOfToday;
    case "7d":
      return startOfToday - 6 * 86_400_000;
    case "30d":
      return startOfToday - 29 * 86_400_000;
    case "all":
      return 0;
  }
}

function personOf(event: AccessEvent): string | null {
  return event.memberName ?? event.username;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Downloads exactly what is on screen (after filters) as a spreadsheet file.
function exportCsv(events: AccessEvent[]): void {
  const rows = [
    ["Time", "Person", "What happened", "How", "Door", "Detail"],
    ...events.map((event) => [
      new Date(event.occurredAt).toISOString(),
      personOf(event) ?? "",
      TYPE_LABELS[event.type],
      METHOD_LABELS[event.method],
      event.doorName ?? "",
      describeEvent(event).detail,
    ]),
  ];
  const text = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `smart-door-log-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

interface LogTabProps {
  events: AccessEvent[];
  doors: Door[];
  loading: boolean;
}

export function LogTab({ events: allEvents, doors, loading }: LogTabProps) {
  // The log is only for unlocks: who opened which door, and how.
  const events = useMemo(() => allEvents.filter((event) => event.type === "granted"), [allEvents]);
  const [doorFilter, setDoorFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState<"all" | AccessMethod>("all");
  const [range, setRange] = useState<Range>("7d");
  const [query, setQuery] = useState("");

  const people = useMemo(
    () => [...new Set(events.map(personOf).filter((name): name is string => name !== null))].sort((a, b) => a.localeCompare(b)),
    [events],
  );
  const methods = useMemo(() => [...new Set(events.map((event) => event.method))], [events]);

  const filtered = useMemo(() => {
    const from = rangeStart(range);
    const needle = query.trim().toLowerCase();
    return events.filter((event) => {
      if (new Date(event.occurredAt).getTime() < from) return false;
      if (doorFilter !== "all" && event.doorId !== doorFilter) return false;
      if (personFilter !== "all" && personOf(event) !== personFilter) return false;
      if (methodFilter !== "all" && event.method !== methodFilter) return false;
      if (needle !== "") {
        const description = describeEvent(event);
        const haystack = [personOf(event), event.doorName, description.title, description.detail, METHOD_LABELS[event.method]]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [events, doorFilter, personFilter, methodFilter, range, query]);

  const groups = groupByDay(filtered);
  const filtersActive =
    doorFilter !== "all" || personFilter !== "all" || methodFilter !== "all" || query !== "";

  const clearFilters = () => {
    setDoorFilter("all");
    setPersonFilter("all");
    setMethodFilter("all");
    setQuery("");
  };

  return (
    <div className="space-y-3.5">
      <SectionHeading label="Activity log" title="Who used the doors">
        <Button variant="outline" disabled={filtered.length === 0} onClick={() => exportCsv(filtered)}>
          <Download />
          Export
        </Button>
      </SectionHeading>

      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or event"
            aria-label="Search the log"
            className="h-[42px] rounded-[11px] pl-9"
          />
        </div>
        <select value={range} onChange={(event) => setRange(event.target.value as Range)} aria-label="Time range" className={cn(SELECT_CLASS, "h-[42px] rounded-[11px] px-2.5 font-medium")}>
          {RANGES.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {doors.length > 1 ? (
          <select value={doorFilter} onChange={(event) => setDoorFilter(event.target.value)} aria-label="Filter by door" className={SELECT_CLASS}>
            <option value="all">All doors</option>
            {doors.map((door) => (
              <option key={door.id} value={door.id}>
                {door.name}
              </option>
            ))}
          </select>
        ) : (
          <span />
        )}
        {people.length > 0 ? (
          <select value={personFilter} onChange={(event) => setPersonFilter(event.target.value)} aria-label="Filter by person" className={SELECT_CLASS}>
            <option value="all">Everyone</option>
            {people.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <span />
        )}
        {methods.length > 1 ? (
          <select
            value={methodFilter}
            onChange={(event) => setMethodFilter(event.target.value as "all" | AccessMethod)}
            aria-label="Filter by how they got in"
            className={SELECT_CLASS}
          >
            <option value="all">Any method</option>
            {methods.map((method) => (
              <option key={method} value={method}>
                {METHOD_LABELS[method]}
              </option>
            ))}
          </select>
        ) : (
          <span />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
        <span>
          <b className="text-foreground">{filtered.length}</b> unlocks
        </span>
        {filtersActive && (
          <button type="button" onClick={clearFilters} className="underline underline-offset-2 hover:text-foreground">
            Clear filters
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-7 text-center text-[13px] text-muted-foreground">
          {loading ? "Loading events…" : events.length === 0 ? "Nothing recorded yet" : "No entries match."}
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.key} className="space-y-2">
              <SectionLabel>
                {group.label} · {group.items.length}
              </SectionLabel>
              <EventList>
                {group.items.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </EventList>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
