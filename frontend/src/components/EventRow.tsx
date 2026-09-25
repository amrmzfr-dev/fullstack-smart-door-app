import {
  DoorClosed,
  DoorOpen,
  FingerprintPattern,
  KeyRound,
  LogOut,
  ShieldX,
  Siren,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

import { describeEvent, type EventTone } from "@/lib/events";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccessEvent } from "@/types";

const TILE_CLASS: Record<EventTone, string> = {
  success: "bg-success/15 text-success",
  danger: "bg-destructive/15 text-destructive",
  muted: "bg-secondary text-muted-foreground",
};

const BADGE_CLASS: Record<EventTone, string> = {
  success: "bg-success/15 text-success",
  danger: "bg-destructive/15 text-destructive",
  muted: "bg-secondary text-secondary-foreground",
};

function eventIcon(event: AccessEvent): LucideIcon {
  switch (event.type) {
    case "forced_open":
    case "left_open":
      return Siren;
    case "door_opened":
      return DoorOpen;
    case "door_closed":
      return DoorClosed;
    case "denied":
      return event.method === "fingerprint" ? FingerprintPattern : ShieldX;
    case "granted":
      switch (event.method) {
        case "keypad":
          return KeyRound;
        case "fingerprint":
          return FingerprintPattern;
        case "exit_button":
          return LogOut;
        case "remote":
        case "app_pin":
          return Smartphone;
        case "phone_fingerprint":
          return FingerprintPattern;
        case "none":
          return DoorOpen;
      }
  }
}

export function EventRow({ event }: { event: AccessEvent }) {
  const description = describeEvent(event);
  const Icon = eventIcon(event);

  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-border bg-card p-3">
      <div
        className={cn("flex size-10 flex-none items-center justify-center rounded-[11px]", TILE_CLASS[description.tone])}
      >
        <Icon className="size-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{description.title}</p>
        {(event.doorName || description.detail) && (
          <p className="truncate text-xs text-muted-foreground">
            {[event.doorName, description.detail].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <div className="flex flex-none flex-col items-end gap-1">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-[9px] tracking-[.08em] uppercase",
            BADGE_CLASS[description.tone],
          )}
        >
          {description.badge}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{formatTime(event.occurredAt)}</span>
      </div>
    </div>
  );
}
