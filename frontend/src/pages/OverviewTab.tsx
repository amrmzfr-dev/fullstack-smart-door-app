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

import { EventList, EventRow } from "@/components/EventRow";
import { PanelHeading, SectionHeading } from "@/components/SectionLabel";
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
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

export type OverviewTarget = "doors" | "people" | "log";

interface OverviewTabProps {
  doors: Door[];
  events: AccessEvent[];
  eventsLoading: boolean;
  onGo: (target: OverviewTarget) => void;
}

type TileTone = "blue" | "plain" | "red";

const TILE_ICON_CLASS: Record<TileTone, string> = {
  blue: "bg-accent text-accent-foreground",
  plain: "bg-secondary text-foreground",
  red: "bg-destructive/15 text-destructive",
};

interface TileProps {
  title: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  tone: TileTone;
}

// One "Today" number: icon, big value, plain-words caption.
function Tile({ title, value, detail, icon: Icon, tone }: TileProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-3.5">
      <div className="flex items-center justify-between">
        <span className={cn("flex size-[34px] items-center justify-center rounded-[10px]", TILE_ICON_CLASS[tone])}>
          <Icon className="size-[18px]" strokeWidth={1.9} />
        </span>
        <span className="font-mono text-[10.5px] text-muted-foreground">Today</span>
      </div>
      <div>
        <div className="text-[28px] leading-none font-semibold tracking-[-.03em] tabular-nums">{value}</div>
        <div className="mt-1.5 text-[13px] font-semibold">{title}</div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function Panel({ label, title, children }: { label?: string; title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <PanelHeading label={label} title={title} />
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
      <div className="relative h-[150px]">
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          <div className="border-t border-dashed border-border" />
          <div className="border-t border-dashed border-border" />
          <div className="border-t border-dashed border-border" />
          <div className="border-t border-border" />
        </div>
        <div
          className="relative flex h-full items-end gap-[5px]"
          role="img"
          aria-label="Opens and refusals per day, last 14 days"
        >
          {stats.days.map((day) => {
            const total = day.granted + day.denied;
            return (
              <div
                key={day.date}
                title={`${day.date}: ${day.granted} opened, ${day.denied} turned away${day.alarms ? `, ${day.alarms} alarms` : ""}`}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              >
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{total > 0 ? total : ""}</span>
                <div
                  className="flex w-full flex-col justify-end overflow-hidden rounded-t-[5px] rounded-b-[2px]"
                  style={{ height: total === 0 ? 3 : `${Math.max(3, (total / peak) * 82)}%` }}
                >
                  <div className="bg-foreground" style={{ flexGrow: day.denied }} />
                  <div className={total === 0 ? "h-full bg-border" : "bg-primary"} style={{ flexGrow: day.granted }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[5px]">
        {stats.days.map((day) => (
          <span key={day.date} className="min-w-0 flex-1 text-center font-mono text-[9px] text-muted-foreground uppercase">
            {shortDay(day.date).slice(0, 2)}
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-primary" /> Opened
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px] bg-foreground" /> Away
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

function Bar({ label, value, peak }: { label: string; value: number; peak: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="min-w-0 truncate font-medium">{label}</span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">{value}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${(value / peak) * 100}%` }} />
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

interface MeterProps {
  label: string;
  value: string;
  detail: string;
  percent: number;
  bad?: boolean;
}

// "Doors online 1/3 · 2 offline" with a thin bar under it.
function Meter({ label, value, detail, percent, bad }: MeterProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="font-medium">{label}</span>
        <span>
          <b className={cn("font-semibold", bad && "text-destructive")}>{value}</b>
          <span className="text-muted-foreground"> · {detail}</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full rounded-full", bad ? "bg-destructive" : "bg-primary")} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function percentOf(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

// Opens in the latest 7 days against the 7 before them, e.g. "+38% vs prior".
function weekChange(stats: Stats): string | null {
  const opens = stats.days.map((day) => day.granted);
  const prior = opens.slice(0, 7).reduce((sum, count) => sum + count, 0);
  const latest = opens.slice(7).reduce((sum, count) => sum + count, 0);
  if (prior === 0) return null;
  const change = Math.round(((latest - prior) / prior) * 100);
  return `${change >= 0 ? "+" : ""}${change}% vs prior week`;
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

  const opens14 = stats ? stats.days.reduce((sum, day) => sum + day.granted, 0) : null;
  const change = stats ? weekChange(stats) : null;

  return (
    <div className="flex flex-col gap-4">
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

      <SectionHeading label="Overview" title="Today at a glance">
        <span className="pb-1 text-xs text-muted-foreground">{DATE_FORMAT.format(now)}</span>
      </SectionHeading>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Big number: opens over the last 14 days */}
      <div className="rounded-[20px] bg-nav p-[18px] text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-white/60">Opens · last 14 days</div>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span className="text-[40px] leading-none font-semibold tracking-[-.035em] tabular-nums">{opens14 ?? "—"}</span>
              {change && (
                <span className="rounded-full bg-white/10 px-2 py-[3px] text-xs font-semibold text-sky-200">{change}</span>
              )}
            </div>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-[5px] text-[11px] font-semibold">
            <span className="size-1.5 rounded-full bg-sky-300" />
            Live
          </span>
        </div>
        <div className="mt-[18px] grid grid-cols-3 border-t border-white/10 pt-3.5">
          <div>
            <div className="text-lg font-semibold tabular-nums">{stats?.deniedToday ?? "—"}</div>
            <div className="mt-0.5 text-[11px] text-white/60">Turned away</div>
          </div>
          <div className="border-l border-white/10 pl-3.5">
            <div className="text-lg font-semibold tabular-nums">{stats?.signInsToday ?? "—"}</div>
            <div className="mt-0.5 text-[11px] text-white/60">Sign-ins</div>
          </div>
          <div className="border-l border-white/10 pl-3.5">
            <div className={cn("text-lg font-semibold tabular-nums", stats && stats.alarmsToday > 0 && "text-red-300")}>
              {stats?.alarmsToday ?? "—"}
            </div>
            <div className="mt-0.5 text-[11px] text-white/60">Alarms</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Tile
          title="Doors opened"
          value={stats?.grantedToday ?? "—"}
          detail={stats && stats.grantedToday === 0 ? "No opens yet today" : "Opened today"}
          icon={DoorOpen}
          tone="blue"
        />
        <Tile title="Turned away" value={stats?.deniedToday ?? "—"} detail="Wrong PIN or blocked" icon={ShieldAlert} tone="plain" />
        <Tile
          title="People in"
          value={stats?.activePeopleToday ?? "—"}
          detail={stats ? `${stats.signInsToday} signed in on the app` : "Different people"}
          icon={Users}
          tone="plain"
        />
        <Tile title="Alarms" value={stats?.alarmsToday ?? "—"} detail="Forced or left open" icon={Siren} tone="red" />
      </div>

      <Panel label="Last 14 days" title="Opens per day">
        {stats ? <DaysChart stats={stats} /> : <p className="text-sm text-muted-foreground">Loading…</p>}
      </Panel>

      <Panel title="System health">
        {stats ? (
          <div className="flex flex-col gap-3.5">
            <Meter
              label="Doors online"
              value={`${stats.doorsOnline}/${stats.doors}`}
              detail={stats.doorsOnline === stats.doors ? "all online" : `${stats.doors - stats.doorsOnline} offline`}
              percent={percentOf(stats.doorsOnline, stats.doors)}
              bad={stats.doorsOnline < stats.doors}
            />
            <Meter
              label="People enabled"
              value={`${stats.membersEnabled}/${stats.members}`}
              detail={stats.membersEnabled === stats.members ? "all active" : "some switched off"}
              percent={percentOf(stats.membersEnabled, stats.members)}
            />
            <Meter
              label="PIN required"
              value={`${stats.doorsPinRequired}/${stats.doors}`}
              detail="doors"
              percent={percentOf(stats.doorsPinRequired, stats.doors)}
            />
            <Meter
              label="Open hours set"
              value={`${stats.doorsWithOpenHours}/${stats.doors}`}
              detail="doors"
              percent={percentOf(stats.doorsWithOpenHours, stats.doors)}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </Panel>

      <Panel label="Setup check" title={problems === 0 ? "All good" : `${problems} to look at`}>
        <ul className="space-y-2.5">
          {health.map((item) => (
            <li key={item.text} className="flex items-start gap-2 text-[13px]">
              {item.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 flex-none text-success" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 flex-none text-warning" />
              )}
              <span className="min-w-0 flex-1">{item.text}</span>
              {item.action && (
                <Button variant="outline" size="xs" onClick={() => onGo(item.action!.target)}>
                  {item.action.label}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      {/* Every door: state, PIN rule and weekly schedule */}
      <Panel label="Doors" title="State, PIN rule and open hours">
        {doors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No doors yet.</p>
        ) : (
          <div className="space-y-2.5">
            {doors.map((door) => {
              const insideHours = isInsideOpenHours(door.schedule, now);
              const stat = stats?.perDoor.find((entry) => entry.doorId === door.id);
              const LockIcon = door.locked === false ? LockOpen : Lock;
              return (
                <div key={door.id} className="space-y-2 rounded-[14px] border border-border bg-soft p-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("size-[7px] flex-none rounded-full", door.online ? "bg-success" : "bg-destructive")} />
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold">{door.name}</p>
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
            <DoorClosed />
            Manage doors
          </Button>
        </div>
      </Panel>

      <Panel label="Last 30 days" title="Most active people">
        {!stats || stats.topPeople.length === 0 ? (
          <p className="text-sm text-muted-foreground">No named opens yet.</p>
        ) : (
          <div className="space-y-3.5">
            {stats.topPeople.map((person) => (
              <div key={person.memberId}>
                <Bar label={person.name} value={person.count} peak={peoplePeak} />
                <p className="mt-1 text-[11px] text-muted-foreground">Last in {formatAgo(person.lastAt, now)}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel label="Last 30 days" title="How people get in">
        {!stats || stats.methods.length === 0 ? (
          <p className="text-sm text-muted-foreground">No opens yet.</p>
        ) : (
          <div className="space-y-3.5">
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
          <div className="space-y-3.5">
            {stats.perDoor.map((door) => (
              <div key={door.doorId ?? door.name}>
                <Bar label={door.name} value={door.granted + door.denied} peak={doorPeak} />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {door.granted} opened · {door.denied} turned away
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel label="Hours" title="When doors get opened">
        {stats ? <HoursChart stats={stats} /> : <p className="text-sm text-muted-foreground">Loading…</p>}
      </Panel>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Who came in</h3>
          <button type="button" onClick={() => onGo("log")} className="text-[13px] text-muted-foreground">
            See all
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {eventsLoading ? "Loading activity…" : "Nothing yet — opens and sign-ins show up here."}
          </p>
        ) : (
          <EventList>
            {recent.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </EventList>
        )}
      </section>
    </div>
  );
}
