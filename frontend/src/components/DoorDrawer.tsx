import { useEffect } from "react";
import { Check, DoorClosed, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PublicDoor } from "@/types";

interface DoorDrawerProps {
  open: boolean;
  doors: PublicDoor[];
  pickedId: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}

function doorLine(door: PublicDoor): string {
  if (!door.online) return "Offline";
  if (door.doorOpen) return "Door open";
  return door.locked === false ? "Unlocked" : "Locked";
}

// Slides in from the left to choose which door the keypad opens. Tap outside,
// press Escape or pick a door to close it.
export function DoorDrawer({ open, doors, pickedId, onPick, onClose }: DoorDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <div className={cn("fixed inset-0 z-50", !open && "pointer-events-none")} aria-hidden={!open}>
      {/* Dim backdrop — tap to close */}
      <div
        onClick={onClose}
        className={cn("absolute inset-0 bg-black/40 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}
      />

      <nav
        aria-label="Choose door"
        className={cn(
          "absolute inset-y-0 left-0 flex w-[min(300px,82vw)] flex-col border-r border-border bg-card shadow-2xl transition-transform duration-200 ease-out",
          "pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))]",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-4 pb-3">
          <span className="font-mono text-[11px] font-medium tracking-[.16em] text-muted-foreground uppercase">
            Choose door
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2">
          {doors.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No doors yet</p>}
          {doors.map((door) => {
            const picked = door.id === pickedId;
            return (
              <button
                key={door.id}
                type="button"
                onClick={() => onPick(door.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left transition-colors",
                  picked ? "bg-primary/15" : "hover:bg-secondary",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 flex-none items-center justify-center rounded-[10px]",
                    picked ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                  )}
                >
                  <DoorClosed className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold tracking-tight">{door.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("size-1.5 rounded-full", door.online ? "bg-success" : "bg-muted-foreground/50")} />
                    {doorLine(door)}
                  </span>
                </span>
                {picked && <Check className="size-4 flex-none text-primary" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
