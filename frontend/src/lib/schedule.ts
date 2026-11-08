import type { DoorSchedule } from "@/types";

// Day numbers match the backend: 0 = Monday ... 6 = Sunday.
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function formatClock(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function describeDays(days: number[]): string {
  if (days.length === 7) return "every day";
  if (days.join() === "0,1,2,3,4") return "Monday to Friday";
  if (days.length === 0) return "no days";
  return days.map((day) => DAY_NAMES[day]).join(", ");
}

// One plain sentence for a door's open hours.
export function describeSchedule(schedule: DoorSchedule): string {
  if (!schedule.enabled) return "No open hours — opens only with a PIN, fingerprint or phone";
  return `Unlocked ${formatClock(schedule.from)} – ${formatClock(schedule.until)}, ${describeDays(schedule.days)}`;
}

// Is the door inside its open hours right now (in the door's own time zone)?
export function isInsideOpenHours(schedule: DoorSchedule, nowMs: number): boolean {
  if (!schedule.enabled) return false;
  const local = new Date(nowMs + schedule.utcOffsetMinutes * 60_000);
  // getUTCDay: 0 = Sunday, so shift to 0 = Monday.
  const day = (local.getUTCDay() + 6) % 7;
  if (!schedule.days.includes(day)) return false;
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const [fromH, fromM] = schedule.from.split(":").map(Number);
  const [untilH, untilM] = schedule.until.split(":").map(Number);
  return minutes >= fromH * 60 + fromM && minutes < untilH * 60 + untilM;
}
