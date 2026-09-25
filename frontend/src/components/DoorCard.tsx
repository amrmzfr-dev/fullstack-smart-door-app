import { useState } from "react";
import { Cpu, DoorClosed, DoorOpen, FingerprintPattern, KeyRound, Lock, LockOpen, Pencil, PlugZap, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DoorNameDialog } from "@/components/DoorNameDialog";
import { DoorSetupDialog } from "@/components/DoorSetupDialog";
import { PinPadDialog } from "@/components/PinPadDialog";
import { StatusCard, type StatusTone } from "@/components/StatusCard";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { clearDoorPin, deleteDoor, renameDoor, resetDoorKey } from "@/lib/door";
import { formatAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Door, DoorSetup } from "@/types";

interface CardState {
  value: string;
  tone: StatusTone;
}

// While the controller is offline its last reported state may be stale, so
// the value is shown but the dot goes grey.
function stateCard(known: boolean | null, online: boolean, whenTrue: CardState, whenFalse: CardState): CardState {
  if (known === null) return { value: "—", tone: "unknown" };
  const state = known ? whenTrue : whenFalse;
  return online ? state : { ...state, tone: "unknown" };
}

type Dialog = "pin" | "remove-pin" | "rename" | "reset-key" | "delete" | null;

interface DoorCardProps {
  door: Door;
  now: number;
  onChanged: () => void;
  onNotice: (tone: "success" | "error", text: string) => void;
}

// One door on the admin Doors tab: live state, its PIN, and door settings.
export function DoorCard({ door, now, onChanged, onNotice }: DoorCardProps) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<DoorSetup | null>(null);

  // Never connected = its controller hasn't been set up yet.
  const neverSeen = door.lastSeenAt === null;
  const online = door.online;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      onNotice("error", errorMessage(err, "Something went wrong. Try again."));
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const doorState = stateCard(door.doorOpen, online, { value: "Open", tone: "warn" }, { value: "Closed", tone: "good" });
  const lockState = stateCard(door.locked, online, { value: "Locked", tone: "good" }, { value: "Unlocked", tone: "warn" });
  const sensorState = stateCard(
    door.fingerprintReady,
    online,
    { value: "Ready", tone: "good" },
    { value: "Not found", tone: "bad" },
  );

  const controllerDetail = neverSeen
    ? "Not set up yet"
    : online
      ? [door.firmwareVersion && `Firmware ${door.firmwareVersion}`, door.ipAddress].filter(Boolean).join(" · ")
      : `Last seen ${formatAgo(door.lastSeenAt ?? "", now)}`;

  return (
    <div className="space-y-3 rounded-[20px] border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-11 flex-none items-center justify-center rounded-[12px]",
            online ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
          )}
        >
          <DoorClosed className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold tracking-tight">{door.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={cn(
                "size-2 rounded-full",
                online ? "bg-success" : neverSeen ? "bg-muted-foreground/40" : "bg-destructive",
              )}
            />
            {online ? "Online" : neverSeen ? "Waiting for its controller" : "Offline"}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label={`Rename ${door.name}`} onClick={() => setDialog("rename")}>
          <Pencil />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatusCard
          label="Door"
          icon={door.doorOpen ? DoorOpen : DoorClosed}
          value={doorState.value}
          tone={doorState.tone}
          detail="Door contact"
        />
        <StatusCard
          label="Lock"
          icon={door.locked === false ? LockOpen : Lock}
          value={lockState.value}
          tone={lockState.tone}
          detail="Magnetic lock"
        />
        <StatusCard
          label="Controller"
          icon={Cpu}
          value={neverSeen ? "—" : online ? "Online" : "Offline"}
          tone={neverSeen ? "unknown" : online ? "good" : "bad"}
          detail={controllerDetail || "Reporting"}
        />
        <StatusCard
          label="Fingerprint"
          icon={FingerprintPattern}
          value={sensorState.value}
          tone={sensorState.tone}
          detail={door.templateCount != null ? `${door.templateCount} stored on sensor` : "AS608 sensor"}
        />
      </div>

      {/* This door's PIN */}
      <div className="flex items-center gap-3 rounded-[14px] bg-secondary/60 p-3">
        <KeyRound className="size-4 flex-none text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Door PIN</p>
          <p className="truncate text-xs text-muted-foreground">
            {door.pinSet
              ? `• • • • — for everyone at this door${door.pinUpdatedAt ? ` · changed ${formatAgo(door.pinUpdatedAt, now)}` : ""}`
              : "Not set — the PIN keypad won't open this door"}
          </p>
        </div>
        {door.pinSet && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDialog("remove-pin")}>
            Remove
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setDialog("pin")}>
          {door.pinSet ? "Change" : "Set PIN"}
        </Button>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => (neverSeen ? void run(async () => setSetup(await resetDoorKey(door.id))) : setDialog("reset-key"))}
        >
          <PlugZap />
          Set up controller
        </Button>
        <Button variant="destructive" size="sm" disabled={busy} onClick={() => setDialog("delete")}>
          <Trash2 />
          Delete door
        </Button>
      </div>

      {dialog === "pin" && (
        <PinPadDialog
          door={door}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            onNotice("success", `${door.name} PIN saved — the door picks it up within seconds`);
            onChanged();
          }}
        />
      )}

      {dialog === "remove-pin" && (
        <ConfirmDialog
          title={`Remove the ${door.name} PIN?`}
          detail="Nobody will be able to open this door with a PIN — only with a fingerprint."
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirmed={() =>
            void run(async () => {
              await clearDoorPin(door.id);
              setDialog(null);
              onNotice("success", `${door.name} PIN removed`);
            })
          }
        />
      )}

      {dialog === "rename" && (
        <DoorNameDialog
          title="Rename door"
          subtitle="Shown in the keypad app and the log"
          submitLabel="Save name"
          initialName={door.name}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            await renameDoor(door.id, name);
            setDialog(null);
            onChanged();
          }}
        />
      )}

      {dialog === "reset-key" && (
        <ConfirmDialog
          title={`New key for ${door.name}?`}
          detail="Its controller stops connecting until it's re-flashed with the new key. Only do this for a new or replaced controller, or a leaked key."
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirmed={() =>
            void run(async () => {
              setSetup(await resetDoorKey(door.id));
              setDialog(null);
            })
          }
        />
      )}

      {dialog === "delete" && (
        <ConfirmDialog
          title={`Delete ${door.name}?`}
          detail="Its PIN, its fingerprints and who may open it are removed. The log keeps its entries."
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirmed={() =>
            void run(async () => {
              await deleteDoor(door.id);
              setDialog(null);
              onNotice("success", `${door.name} deleted`);
            })
          }
        />
      )}

      {setup && <DoorSetupDialog setup={setup} onClose={() => setSetup(null)} />}
    </div>
  );
}
