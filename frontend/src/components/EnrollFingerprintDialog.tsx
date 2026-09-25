import { useState } from "react";
import { Check, CircleAlert, FingerprintPattern, LoaderCircle } from "lucide-react";

import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isFinished, useCommandTracker } from "@/hooks/useCommandTracker";
import { errorMessage } from "@/lib/api";
import { cancelCommand, startEnrollment } from "@/lib/door";
import { cn } from "@/lib/utils";
import type { Door, EnrollStep, Member } from "@/types";

const LABEL_PRESETS = ["Right thumb", "Left thumb", "Right index", "Left index"];

// Step names come from the firmware (enrollSetStep in main.cpp).
const STEPS: ReadonlyArray<{ key: EnrollStep; title: string; hint: string }> = [
  { key: "place_finger", title: "Place finger", hint: "Put the finger flat on the door's sensor" },
  { key: "remove_finger", title: "Lift finger", hint: "Take it off the sensor" },
  { key: "place_again", title: "Same finger again", hint: "Place the same finger once more" },
  { key: "saving", title: "Saving", hint: "Storing it on the sensor" },
];

const WAITING_FOR_FINGER: ReadonlyArray<string> = ["place_finger", "place_again"];

interface EnrollFingerprintDialogProps {
  member: Member;
  // Enrolled on this door's own sensor, so it only works on this door.
  door: Door;
  onClose: () => void;
}

export function EnrollFingerprintDialog({ member, door, onClose }: EnrollFingerprintDialogProps) {
  const doorOnline = door.online;
  const [label, setLabel] = useState(LABEL_PRESETS[0]);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const { command, track, reset } = useCommandTracker();

  const begin = async () => {
    setStarting(true);
    setStartError(null);
    try {
      track(await startEnrollment(member.id, door.id, label.trim()));
    } catch (err) {
      setStartError(errorMessage(err, "Couldn't start enrollment. Try again."));
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (command && !isFinished(command.status)) {
      try {
        track(await cancelCommand(command.id));
      } catch {
        // Backend expires it on its own anyway.
      }
    }
    onClose();
  };

  // ---- Pick a label ----
  if (command === null) {
    return (
      <Modal
        title={`Add fingerprint for ${member.name}`}
        subtitle={`On the ${door.name} sensor — stand at that door before you start`}
        onClose={onClose}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="font-mono text-[10px] font-medium tracking-[.14em] text-muted-foreground uppercase">
              Which finger
            </span>
            <div className="flex flex-wrap gap-2">
              {LABEL_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setLabel(preset)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                    label === preset
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border bg-secondary text-secondary-foreground hover:bg-muted",
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
            <Input
              value={label}
              maxLength={64}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Or type a name"
              className="h-10 rounded-[12px]"
            />
          </div>

          {!doorOnline && (
            <p className="rounded-[12px] bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {door.name} is offline. Enrollment needs its controller online.
            </p>
          )}
          {startError && <p className="text-xs text-destructive">{startError}</p>}

          <Button
            className="h-11 w-full rounded-[14px] text-sm font-extrabold uppercase"
            disabled={starting || !doorOnline || label.trim().length === 0}
            onClick={() => void begin()}
          >
            {starting ? <LoaderCircle className="animate-spin" /> : <FingerprintPattern />}
            Start enrollment
          </Button>
        </div>
      </Modal>
    );
  }

  // ---- Live progress ----
  const stepIndex = STEPS.findIndex((step) => step.key === command.step);
  const succeeded = command.status === "succeeded";
  const failed = command.status === "failed" || command.status === "expired";
  const finished = isFinished(command.status);
  const waiting = command.status === "pending" || command.status === "sent";
  const wantsFinger = command.status === "in_progress" && WAITING_FOR_FINGER.includes(command.step ?? "");

  const headline = succeeded
    ? "Fingerprint saved"
    : failed
      ? "Enrollment failed"
      : command.status === "cancelled"
        ? "Cancelled"
        : waiting
          ? "Waiting for the door…"
          : (STEPS[stepIndex]?.title ?? "Working…");

  const detail = succeeded
    ? `${label} can now open ${door.name}.`
    : failed
      ? (command.message ?? "Something went wrong.")
      : waiting
        ? "Sending the request to the door controller."
        : (STEPS[stepIndex]?.hint ?? "");

  return (
    <Modal title={`${label} · ${member.name}`} subtitle={door.name} onClose={() => void cancel()}>
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-3 pt-2 text-center">
          <div className="relative flex size-28 items-center justify-center">
            {wantsFinger && <span className="absolute inset-0 rounded-full bg-primary/40 animate-gc-pulse" />}
            <div
              className={cn(
                "relative flex size-28 items-center justify-center rounded-full border-2",
                succeeded
                  ? "border-success bg-success/15 text-success"
                  : failed
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-primary bg-accent text-accent-foreground",
              )}
            >
              {succeeded ? (
                <Check className="size-12" strokeWidth={2.5} />
              ) : failed ? (
                <CircleAlert className="size-12" />
              ) : waiting || command.step === "saving" ? (
                <LoaderCircle className="size-12 animate-spin" />
              ) : (
                <FingerprintPattern className="size-14" />
              )}
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xl font-extrabold tracking-tight uppercase">{headline}</p>
            <p className="text-sm text-muted-foreground">{detail}</p>
          </div>
        </div>

        <ol className="space-y-1.5">
          {STEPS.map((step, index) => {
            const done = succeeded || (stepIndex >= 0 && index < stepIndex);
            const current = !finished && index === stepIndex;
            return (
              <li
                key={step.key}
                className={cn(
                  "flex items-center gap-3 rounded-[12px] border px-3 py-2 text-sm",
                  current ? "border-primary bg-accent" : "border-border",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 flex-none items-center justify-center rounded-full font-mono text-[11px] font-medium",
                    done
                      ? "bg-success text-background"
                      : current
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
                </span>
                <span className={cn("font-semibold", !done && !current && "text-muted-foreground")}>{step.title}</span>
              </li>
            );
          })}
        </ol>

        {finished ? (
          <div className="flex gap-2">
            {!succeeded && (
              <Button variant="outline" className="h-10 flex-1 rounded-[12px]" onClick={reset}>
                Try again
              </Button>
            )}
            <Button className="h-10 flex-1 rounded-[12px] font-bold" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="h-10 w-full rounded-[12px]" onClick={() => void cancel()}>
            Cancel
          </Button>
        )}
      </div>
    </Modal>
  );
}
