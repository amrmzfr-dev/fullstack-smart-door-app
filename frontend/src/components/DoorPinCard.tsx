import { useCallback, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PinPadDialog } from "@/components/PinPadDialog";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/useNow";
import { errorMessage } from "@/lib/api";
import { clearDoorPin, fetchDoorPin } from "@/lib/door";
import { formatAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DoorPinStatus } from "@/types";

const NOTICE_MS = 4000;

interface Notice {
  tone: "success" | "error";
  text: string;
}

// The one PIN everyone uses — on the door's keypad and in the keypad app.
export function DoorPinCard() {
  const now = useNow();
  const [status, setStatus] = useState<DoorPinStatus | null>(null);
  const [dialog, setDialog] = useState<"set" | "remove" | null>(null);
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchDoorPin());
    } catch {
      setNotice({ tone: "error", text: "Couldn't load the door PIN" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const remove = async () => {
    setRemoving(true);
    try {
      setStatus(await clearDoorPin());
      setNotice({ tone: "success", text: "Door PIN removed — only fingerprints open the door now" });
      setDialog(null);
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err, "Couldn't remove the PIN. Try again.") });
    } finally {
      setRemoving(false);
    }
  };

  const isSet = status?.isSet ?? false;

  return (
    <div className="space-y-3 rounded-[18px] border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-11 flex-none items-center justify-center rounded-[12px] bg-secondary text-secondary-foreground">
          <KeyRound className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold tracking-tight">Door PIN</p>
          <p className="text-xs text-muted-foreground">
            {status === null
              ? "Loading…"
              : isSet
                ? `• • • • — one PIN for everyone${status.updatedAt ? ` · changed ${formatAgo(status.updatedAt, now)}` : ""}`
                : "Not set — the PIN keypad won't open the door"}
          </p>
        </div>
        {isSet && (
          <Button variant="ghost" size="sm" onClick={() => setDialog("remove")}>
            Remove
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={status === null} onClick={() => setDialog("set")}>
          {isSet ? "Change" : "Set PIN"}
        </Button>
      </div>

      {notice && (
        <p
          className={cn(
            "rounded-[12px] px-3 py-2 text-sm",
            notice.tone === "success" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
          )}
        >
          {notice.text}
        </p>
      )}

      {dialog === "set" && (
        <PinPadDialog
          replacing={isSet}
          onClose={() => setDialog(null)}
          onSaved={(next) => {
            setStatus(next);
            setDialog(null);
            setNotice({ tone: "success", text: "Door PIN saved — share it with everyone who needs in" });
          }}
        />
      )}

      {dialog === "remove" && (
        <ConfirmDialog
          title="Remove the door PIN?"
          detail="Nobody will be able to open the door with a PIN — only with a fingerprint."
          busy={removing}
          onCancel={() => setDialog(null)}
          onConfirmed={() => void remove()}
        />
      )}
    </div>
  );
}
