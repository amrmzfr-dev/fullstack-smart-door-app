import { useCallback, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Keypad, PinDisplay, type KeypadKey } from "@/components/Keypad";
import { Modal } from "@/components/Modal";
import type { MemberDoor } from "@/types";

const PIN_LENGTH = 4;

const DIGITS = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

export function UnlockPinDialog({
  door,
  onClose,
  onSubmit,
}: {
  door: MemberDoor;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [sending, setSending] = useState(false);

  const submit = useCallback(
    async (pin: string) => {
      setSending(true);
      const problem = await onSubmit(pin);
      if (problem !== null) {
        setError(problem);
        setShakeKey((current) => current + 1);
        setValue("");
        setSending(false);
      }
    },
    [onSubmit],
  );

  const handleKey = useCallback(
    (key: KeypadKey) => {
      if (sending) return;
      if (key === "*") {
        setValue("");
        setError(null);
        return;
      }
      if (key === "#") {
        if (value.length === PIN_LENGTH) void submit(value);
        return;
      }
      setError(null);
      const next = value.length < PIN_LENGTH ? value + key : value;
      setValue(next);
      if (next.length === PIN_LENGTH) void submit(next);
    },
    [sending, value, submit],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (DIGITS.has(event.key)) {
        handleKey(event.key as KeypadKey);
      } else if (event.key === "Backspace") {
        setValue((current) => current.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  return (
    <Modal title={`Unlock ${door.name}`} subtitle="Type this door's PIN" onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-2 text-center">
          <PinDisplay
            length={value.length}
            minLength={PIN_LENGTH}
            maxLength={PIN_LENGTH}
            error={error !== null}
            shakeKey={shakeKey}
          />
          <p className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {sending ? (
              <span className="inline-flex items-center gap-1.5">
                <LoaderCircle className="size-3.5 animate-spin" /> Checking…
              </span>
            ) : (
              (error ?? `${PIN_LENGTH} digits — it opens as soon as you type the last one`)
            )}
          </p>
        </div>
        <Keypad onKey={handleKey} disabled={sending} />
      </div>
    </Modal>
  );
}
