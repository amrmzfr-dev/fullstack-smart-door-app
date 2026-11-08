import type { ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  DoorClosed,
  DoorOpen,
  KeyRound,
  Lock,
  LockOpen,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Users,
  type LucideIcon,
} from "lucide-react";

import { EventRow } from "@/components/EventRow";
import { SectionHeading, SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/useNow";
import { useStats } from "@/hooks/useStats";
import { METHOD_LABELS, describeEvent, isAlarm } from "@/lib/events";
import { formatAgo } from "@/lib/format";
import { describeSchedule, isInsideOpenHours } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import type { AccessEvent, Door, Stats } from "@/types";

const ALARM_BANNER_MS = 10 * 60 * 1000;
const RECENT_COUNT = 8;

export type OverviewTarget = "doors" | "people" | "log";

interface OverviewTabProps {
  doors: Door[];
  events: AccessEvent[];
  eventsLoading: boolean;
  onGo: (target: OverviewTarget) => void;
}

interface TileProps {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  tone?: "default" | "good" | "bad";
}

function Tile({ label, value, detail, icon: Icon, tone = "default" }: TileProps) {
  return (
    <div className="flex flex-col gap-2 rounded-[18px] border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>{label}</SectionLabel>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <span
        className={cn(
          "text-3xl leading-none font-extrabold tracking-tight tabular-nums",
          tone === "good" && "text-success",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </span>
      <span className="truncate text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}

function Panel({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-[20px] border border-border bg-card p-4">
      <SectionHeading label={label} title={title} />
      {children}
    </section>
  );
}

function shortDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: "short" });
}

// Opens and turned-away entries for the last 14 days, one bar per day.
function DaysChart({ stats }: { stats: Stats }) {
  const peak = Math.max(1, ...stats.days.map((day) => day.granted + day.denied));
  return (
    <div>
      <div className="flex h-36 items-end gap-1.5" role="img" aria-label="Opens and refusals per day, last 14 days">
        {stats.days.map((day) => {
          const total = day.granted + day.denied;
          return (
            <div
              key={day.date}
              title={`${day.date}: ${day.granted} opened, ${day.denied} turned away${day.alarms ? `, ${day.alarms} alarms` : ""}`}
              className="flex h-full flex-1 flex-col justify-end"
            >
              <span className="mb-1 text-center font-mono text-[9px] text-muted-foreground tabular-nums">
                {total > 0 ? total : ""}
              </span>
              <div className="flex flex-col justify-end overflow-hidden rounded-t-md" style={{ height: `${(total / peak) * 100}%` }}>
                <div className="bg-destructive" style={{ flexGrow: day.denied }} />
                <div className="bg-primary" style={{ flexGrow: day.granted }} />
              </div>
              <div className={cn("h-0.5 rounded-full", total === 0 ? "bg-border" : "bg-transparent")} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {stats.days.map((day) => (
          <span key={day.date} className="flex-1 text-center font-mono text-[9px] text-muted-foreground uppercase">
            {shortDay(day.date).slice(0, 2)}
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" /> Opened
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-destructive" /> Turned away
        </span>
      </div>
    </div>
  );
}

// When people open doors: one thin bar per hour of the day (last 30 days).
function HoursChart({ stats }: { stats: Stats }) {
  const peak = Math.max(1, ...stats.hours.map((hour) => hour.count));
  const busiest = stats.hours.reduce((best, hour) => (hour.count > best.count ? hour : best), stats.hours[0]);
  return (
    <div>
      <div className="flex h-24 items-end gap-0.5" role="img" aria-label="Opens by hour of the day, last 30 days">
        {stats.hours.map((hour) => (
          <div
            key={hour.hour}
            title={`${String(hour.hour).padStart(2, "0")}:00 — ${hour.count} opens`}
            className="flex-1 rounded-t-sm bg-primary/70"
            style={{ height: `${Math.max(hour.count === 0 ? 0 : 6, (hour.count / peak) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {busiest && busiest.count > 0
          ? `Busiest hour: ${String(busiest.hour).padStart(2, "0")}:00 (${busiest.count} opens in 30 days)`
          : "No opens in the last 30 days yet"}
      </p>
    </div>
  );
}

function Bar({ label, value, peak, tone = "primary" }: { label: string; value: number; peak: number; tone?: "primary" | "muted" }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-semibold">{label}</span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("h-full rounded-full", tone === "primary" ? "bg-primary" : "bg-muted-foreground/50")}
          style={{ width: `${(value / peak) * 100}%` }}
        />
      </div>
    </div>
  );
}

interface HealthItem {
  ok: boolean;
  text: string;
  action?: { label: string; target: OverviewTarget };
}

function healthItems(doors: Door[], stats: Stats | null): HealthItem[] {
  const offline = doors.filter((door) => door.online === false && door.lastSeenAt !== null);
  const noPin = doors.filter((door) => !door.pinSet);
  const items: HealthItem[] = [
    offline.length === 0
      ? { ok: true, text: "Every door that was set up is online" }
      : { ok: false, text: `Offline: ${offline.map((door) => door.name).join(", ")}`, action: { label: "Doors", target: "doors" } },
    noPin.length === 0
      ? { ok: true, text: "Every door has a PIN" }
      : { ok: false, text: `No PIN yet: ${noPin.map((door) => door.name).join(", ")}`, action: { label: "Set PIN", target: "doors" } },
  ];
  if (stats) {
    const without = stats.members - stats.membersWithAccount;
    items.push(
      without === 0
        ? { ok: true, text: "Everyone has a sign-in" }
        : {
            ok: false,
            text: `${without} ${without === 1 ? "person has" : "people have"} no sign-in yet`,
            action: { label: "People", target: "people" },
          },
    );
    const open = stats.doors - stats.doorsPinRequired;
    items.push(
      open === 0
        ? { ok: true, text: "PIN is required on every door for account unlock" }
        : {
            ok: false,
            text: `${open} ${open === 1 ? "door lets" : "doors let"} signed-in people unlock without a PIN`,
            action: { label: "Review", target: "doors" },
          },
    );
  }
  return items;
}

export function OverviewTab({ doors, events, eventsLoading, onGo }: OverviewTabProps) {
  const now = useNow(30000);
  const { stats, error } = useStats();

  const latestAlarm = events.find(isAlarm);
  const showAlarm = latestAlarm !== undefined && now - new Date(latestAlarm.occurredAt).getTime() < ALARM_BANNER_MS;
  const recent = events.filter((event) => event.type !== "door_opened" && event.type !== "door_closed").slice(0, RECENT_COUNT);
  const health = healthItems(doors, stats);
  const problems = health.filter((item) => !item.ok).length;

  const methodPeak = Math.max(1, ...(stats?.methods.map((method) => method.count) ?? [1]));
  const doorPeak = Math.max(1, ...(stats?.perDoor.map((door) => door.granted + door.denied) ?? [1]));
  const peoplePeak = Math.max(1, ...(stats?.topPeople.map((person) => person.count) ?? [1]));

  return (
    <div className="space-y-6">
      {showAlarm && latestAlarm && (
        <div className="flex items-center gap-3 rounded-[16px] border border-destructive/40 bg-destructive/10 p-3 text-destructive">
          <Siren className="size-5 flex-none" />
          <div className="min-w-0">
            <p className="text-sm font-bold">
              {describeEvent(latestAlarm).title}
              {latestAlarm.doorName && ` · ${latestAlarm.doorName}`}
            </p>
            <p className="text-xs opacity-80">{formatAgo(latestAlarm.occurredAt, now)}</p>
          </div>
        </div>
      )}

      <SectionHeading label="Overview" title="Today at a glance" />
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Opened today" value={stats?.grantedToday ?? "—"} detail="Doors opened" icon={DoorOpen} tone="good" />
        <Tile
          label="Turned away"
          value={stats?.deniedToday ?? "—"}
          detail="Wrong PIN or blocked"
          icon={ShieldAlert}
          tone={stats && stats.deniedToday > 0 ? "bad" : "default"}
        />
        <Tile
          label="People today"
          value={stats?.activePeopleToday ?? "—"}
          detail={stats ? `${stats.signInsToday} signed in on the account page` : "Different people"}
          icon={Users}
        />
        <Tile
          label="Alarms today"
          value={stats?.alarmsToday ?? "—"}
          detail="Forced or left open"
          icon={Siren}
          tone={stats && stats.alarmsToday > 0 ? "bad" : "default"}
        />
        <Tile
          label="Doors online"
          value={stats ? `${stats.doorsOnline}/${stats.doors}` : "—"}
          detail={stats ? `${stats.doorsWithOpenHours} with open hours` : "Controllers"}
          icon={DoorClosed}
          tone={stats && stats.doorsOnline < stats.doors ? "bad" : "default"}
        />
        <Tile
          label="People"
          value={stats ? `${stats.membersEnabled}/${stats.members}` : "—"}
          detail="Enabled / total"
          icon={Users}
        />
        <Tile
          label="Sign-ins"
          value={stats?.membersWithAccount ?? "—"}
          detail={stats ? `${stats.membersWithPhone} with a phone · ${stats.membersWithFingerprint} with a finger` : "Accounts"}
          icon={KeyRound}
        />
        <Tile
          label="PIN required"
          value={stats ? `${stats.doorsPinRequired}/${stats.doors}` : "—"}
          detail="Doors asking for the PIN on accounts"
          icon={ShieldCheck}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel label="Last 14 days" title="Opens per day">
            {stats ? <DaysChart stats={stats} /> : <p className="text-sm text-muted-foreground">Loading…</p>}
          </Panel>
        </div>
        <Panel label="Setup check" title={problems === 0 ? "All good" : `${problems} to look at`}>
          <ul className="space-y-2">
            {health.map((item) => (
              <li key={item.text} className="flex items-start gap-2 text-sm">
                {item.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 flex-none text-success" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-4 flex-none text-warning" />
                )}
                <span className="min-w-0 flex-1">{item.text}</span>
                {item.action && (
                  <Button variant="ghost" size="xs" onClick={() => onGo(item.action!.target)}>
                    {item.action.label}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Every door: state, PIN rule and weekly schedule, side by side */}
      <Panel label="Doors" title="State, PIN rule and open hours">
        {doors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No doors yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {doors.map((door) => {
              const insideHours = isInsideOpenHours(door.schedule, now);
              const stat = stats?.perDoor.find((entry) => entry.doorId === door.id);
              const LockIcon = door.locked === false ? LockOpen : Lock;
              return (
                <div key={door.id} className="space-y-2 rounded-[14px] bg-secondary/60 p-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("size-2 flex-none rounded-full", door.online ? "bg-success" : "bg-destructive")} />
                    <p className="min-w-0 flex-1 truncate text-sm font-extrabold tracking-tight">{door.name}</p>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <LockIcon className="size-3.5" />
                      {!door.online ? "Offline" : door.doorOpen ? "Open" : door.locked === false ? "Unlocked" : "Locked"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs">
                      <KeyRound className="size-3" />
                      {door.pinSet ? "PIN set" : "No PIN"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs">
                      <ShieldCheck className="size-3" />
                      {door.pinRequired ? "Accounts need PIN" : "Accounts: one tap"}
                    </span>
                    {door.schedule.enabled && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                          insideHours ? "bg-success/15 text-success" : "border border-border bg-card",
                        )}
                      >
                        <CalendarClock className="size-3" />
                        {insideHours ? "Open hours now" : "Closed hours"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{describeSchedule(door.schedule)}</p>
                  {stat && (
                    <p className="text-xs text-muted-foreground">
                      30 days: {stat.granted} opened · {stat.denied} turned away
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onGo("doors")}>
            Manage doors
          </Button>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel label="Last 30 days" title="Most active people">
          {!stats || stats.topPeople.length === 0 ? (
            <p className="text-sm text-muted-foreground">No named opens yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.topPeople.map((person) => (
                <div key={person.memberId} className="space-y-1">
                  <Bar label={person.name} value={person.count} peak={peoplePeak} />
                  <p className="text-[11px] text-muted-foreground">Last in {formatAgo(person.lastAt, now)}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel label="Last 30 days" title="How people get in">
          {!stats || stats.methods.length === 0 ? (
            <p className="text-sm text-muted-foreground">No opens yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.methods.map((method) => (
                <Bar key={method.method} label={METHOD_LABELS[method.method]} value={method.count} peak={methodPeak} />
              ))}
            </div>
          )}
        </Panel>
        <Panel label="Last 30 days" title="By door">
          {!stats || stats.perDoor.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.perDoor.map((door) => (
                <div key={door.doorId ?? door.name} className="space-y-1">
                  <Bar label={door.name} value={door.granted + door.denied} peak={doorPeak} />
                  <p className="text-[11px] text-muted-foreground">
                    {door.granted} opened · {door.denied} turned away
                  </p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel label="Hours" title="When doors get opened">
        {stats ? <HoursChart stats={stats} /> : <p className="text-sm text-muted-foreground">Loading…</p>}
      </Panel>

      <section className="space-y-3">
        <SectionHeading label="Activity" title="Who came in">
          <Button variant="outline" size="sm" onClick={() => onGo("log")}>
            Full log
          </Button>
        </SectionHeading>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {eventsLoading ? "Loading activity…" : "Nothing yet — opens and sign-ins show up here."}
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
  );
}
