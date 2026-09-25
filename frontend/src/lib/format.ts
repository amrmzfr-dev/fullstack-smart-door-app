const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { timeStyle: "medium" });

// "16 August 2026" — day-group header in the log.
const DAY_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatTime(value: string): string {
  return TIME_FORMAT.format(new Date(value));
}

export function formatDay(value: string): string {
  return DAY_FORMAT.format(new Date(value));
}

// Local (not UTC) calendar-day key, so events group by the day the viewer
// would call "today".
export function dayKey(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function formatAgo(value: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDay(value);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}
