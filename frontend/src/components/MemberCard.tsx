import { FingerprintPattern, KeyRound, Plus, Smartphone, Trash2, X } from "lucide-react";

import { Switch } from "@/components/Switch";
import { Button } from "@/components/ui/button";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Fingerprint, Member, PhoneKey } from "@/types";

interface MemberCardProps {
  member: Member;
  busy: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onSetPin: () => void;
  onClearPin: () => void;
  onAddFingerprint: () => void;
  onDeleteFingerprint: (fingerprint: Fingerprint) => void;
  onDeletePhone: (phone: PhoneKey) => void;
  onDelete: () => void;
}

export function MemberCard({
  member,
  busy,
  onToggleEnabled,
  onSetPin,
  onClearPin,
  onAddFingerprint,
  onDeleteFingerprint,
  onDeletePhone,
  onDelete,
}: MemberCardProps) {
  const fingerprintCount = member.fingerprints.length;

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
            {member.enabled ? "Can open the door" : "Disabled — can't open the door"}
          </p>
        </div>
        <Switch
          checked={member.enabled}
          disabled={busy}
          onChange={onToggleEnabled}
          label={member.enabled ? `Disable ${member.name}` : `Enable ${member.name}`}
        />
      </div>

      {/* PIN */}
      <div className="flex items-center gap-3 rounded-[14px] bg-secondary/60 p-3">
        <KeyRound className="size-4 flex-none text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">PIN</p>
          <p className="font-mono text-xs text-muted-foreground">{member.hasPin ? "• • • •" : "Not set"}</p>
        </div>
        {member.hasPin && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClearPin}>
            Remove
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={onSetPin}>
          {member.hasPin ? "Change" : "Set PIN"}
        </Button>
      </div>

      {/* Fingerprints */}
      <div className="space-y-2 rounded-[14px] bg-secondary/60 p-3">
        <div className="flex items-center gap-3">
          <FingerprintPattern className="size-4 flex-none text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Fingerprints</p>
            <p className="text-xs text-muted-foreground">
              {fingerprintCount === 0 ? "None enrolled" : `${fingerprintCount} enrolled`}
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={busy} onClick={onAddFingerprint}>
            <Plus />
            Add
          </Button>
        </div>
        {fingerprintCount > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-7">
            {member.fingerprints.map((fingerprint) => (
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

      {/* Phones (their own fingerprint / face unlock, set up on the keypad app) */}
      <div className="space-y-2 rounded-[14px] bg-secondary/60 p-3">
        <div className="flex items-center gap-3">
          <Smartphone className="size-4 flex-none text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Phones</p>
            <p className="text-xs text-muted-foreground">
              {member.phones.length === 0
                ? "None — they can set one up on the keypad app with their PIN"
                : `${member.phones.length} set up for fingerprint unlock`}
            </p>
          </div>
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
