import { DoorClosed, FingerprintPattern, Plus, Smartphone, Trash2, X } from "lucide-react";

import { Switch } from "@/components/Switch";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Door, Fingerprint, Member, PhoneKey } from "@/types";

interface MemberCardProps {
  member: Member;
  doors: Door[];
  busy: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onToggleDoor: (door: Door, allowed: boolean) => void;
  onAddFingerprint: (door: Door) => void;
  onDeleteFingerprint: (fingerprint: Fingerprint) => void;
  onSetUpPhone: () => void;
  onDeletePhone: (phone: PhoneKey) => void;
  onDelete: () => void;
}

export function MemberCard({
  member,
  doors,
  busy,
  onToggleEnabled,
  onToggleDoor,
  onAddFingerprint,
  onDeleteFingerprint,
  onSetUpPhone,
  onDeletePhone,
  onDelete,
}: MemberCardProps) {
  const allowedDoors = doors.filter((door) => member.doorIds.includes(door.id));

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-[18px] border border-border bg-card p-4 transition-opacity",
        !member.enabled && "opacity-70",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-11 flex-none items-center justify-center rounded-[12px] bg-secondary font-mono text-sm font-semibold text-secondary-foreground">
          {initials(member.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-extrabold tracking-tight">{member.name}</p>
          <p className="text-xs text-muted-foreground">
            {!member.enabled
              ? "Disabled — can't open any door"
              : `Can open ${allowedDoors.length} of ${doors.length} ${doors.length === 1 ? "door" : "doors"}`}
          </p>
        </div>
        <Switch
          checked={member.enabled}
          disabled={busy}
          onChange={onToggleEnabled}
          label={member.enabled ? `Disable ${member.name}` : `Enable ${member.name}`}
        />
      </div>

      {/* Which doors this person may open */}
      <div className="space-y-2 rounded-[14px] bg-secondary/60 p-3">
        <div className="flex items-center gap-3">
          <DoorClosed className="size-4 flex-none text-muted-foreground" />
          <p className="text-sm font-bold">Doors</p>
        </div>
        <div className="space-y-1.5 pl-7">
          {doors.map((door) => {
            const allowed = member.doorIds.includes(door.id);
            return (
              <div key={door.id} className="flex items-center gap-2">
                <span className={cn("min-w-0 flex-1 truncate text-sm", !allowed && "text-muted-foreground")}>
                  {door.name}
                </span>
                <Switch
                  checked={allowed}
                  disabled={busy}
                  onChange={(next) => onToggleDoor(door, next)}
                  label={allowed ? `Stop ${member.name} opening ${door.name}` : `Let ${member.name} open ${door.name}`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Fingerprints — each one lives on one door's sensor */}
      <div className="space-y-2 rounded-[14px] bg-secondary/60 p-3">
        <div className="flex items-center gap-3">
          <FingerprintPattern className="size-4 flex-none text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Fingerprints</p>
            <p className="text-xs text-muted-foreground">Scanned on each door's own sensor</p>
          </div>
        </div>
        {allowedDoors.length === 0 ? (
          <p className="pl-7 text-xs text-muted-foreground">Switch on a door above to add fingerprints for it.</p>
        ) : (
          <div className="space-y-2 pl-7">
            {allowedDoors.map((door) => {
              const onThisDoor = member.fingerprints.filter((fingerprint) => fingerprint.doorId === door.id);
              return (
                <div key={door.id} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[.12em] text-muted-foreground uppercase">
                      {door.name}
                    </span>
                    <Button variant="outline" size="xs" disabled={busy} onClick={() => onAddFingerprint(door)}>
                      <Plus />
                      Add
                    </Button>
                  </div>
                  {onThisDoor.length === 0 ? (
                    <p className="text-xs text-muted-foreground">None yet</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {onThisDoor.map((fingerprint) => (
                        <span
                          key={fingerprint.id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pr-1 pl-2.5 text-xs font-semibold"
                        >
                          {fingerprint.label}
                          <span className="font-mono text-[10px] text-muted-foreground">#{fingerprint.slot}</span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onDeleteFingerprint(fingerprint)}
                            aria-label={`Remove ${fingerprint.label}`}
                            className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive disabled:opacity-50"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Phones (their own fingerprint / face unlock) — work on every door above */}
      <div className="space-y-2 rounded-[14px] bg-secondary/60 p-3">
        <div className="flex items-center gap-3">
          <Smartphone className="size-4 flex-none text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Phones</p>
            <p className="text-xs text-muted-foreground">
              {member.phones.length === 0
                ? "None set up"
                : `${member.phones.length} set up — opens any door switched on above`}
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={busy} onClick={onSetUpPhone}>
            <Plus />
            Set up
          </Button>
        </div>
        {member.phones.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-7">
            {member.phones.map((phone) => (
              <span
                key={phone.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pr-1 pl-2.5 text-xs font-semibold"
              >
                {phone.label}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDeletePhone(phone)}
                  aria-label={`Remove ${phone.label}`}
                  className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive disabled:opacity-50"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button variant="destructive" size="sm" disabled={busy} onClick={onDelete}>
          <Trash2 />
          Delete person
        </Button>
      </div>
    </div>
  );
}
