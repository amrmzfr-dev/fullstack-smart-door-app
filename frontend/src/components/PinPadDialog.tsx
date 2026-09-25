import { useCallback, useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { Keypad, PinDisplay, type KeypadKey } from "@/components/Keypad";
import { Modal } from "@/components/Modal";
import { errorMessage } from "@/lib/api";
import { setDoorPin } from "@/lib/door";
import type { Door } from "@/types";

// Must match PinRules on the backend and PIN_MIN/MAX_LENGTH in the firmware.
const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 4;

type Phase = "enter" | "confirm";

interface PinPadDialogProps {
  door: Door;
  onClose: () => void;
  onSaved: (door: Door) => void;
}

const DIGITS = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

// Sets a door's PIN, used by everyone at that door (typed twice to avoid
// typos).
export function PinPadDialog({ door, onClose, onSaved }: PinPadDialogProps) {
  const [phase, setPhase] = useState<Phase>("enter");
  const [firstEntry, setFirstEntry] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const fail = useCallback((message: string) => {
    setError(message);
    setShakeKey((current) => current + 1);
    setPhase("enter");
    setFirstEntry("");
    setValue("");
  }, []);

  const save = useCallback(
    async (pin: string) => {
      setSaving(true);
      try {
        onSaved(await setDoorPin(door.id, pin));
      } catch (err) {
        fail(errorMessage(err, "Couldn't save the PIN. Try again."));
      } finally {
        setSaving(false);
      }
    },
    [door.id, onSaved, fail],
  );

  const handleKey = useCallback(
    (key: KeypadKey) => {
      if (saving) return;

      if (key === "*") {
        setValue("");
        setError(null);
        return;
      }

      if (key === "#") {
        if (value.length < PIN_MIN_LENGTH) {
          setError(`PIN must be ${PIN_MAX_LENGTH} digits`);
          setShakeKey((current) => current + 1);
          return;
        }
        if (phase === "enter") {
          setFirstEntry(value);
          setValue("");
          setPhase("confirm");
          setError(null);
          return;
        }
        if (value !== firstEntry) {
          fail("The two PINs didn't match — start again");
          return;
        }
        void save(value);
        return;
      }

      setError(null);
      setValue((current) => (current.length < PIN_MAX_LENGTH ? current + key : current));
    },
    [saving, value, phase, firstEntry, fail, save],
  );

  // Typing on a real keyboard works too: digits, Enter = #, Backspace, and
  // Delete / * = clear.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (DIGITS.has(event.key)) {
        handleKey(event.key as KeypadKey);
      } else if (event.key === "Enter" || event.key === "#") {
        event.preventDefault();
        handleKey("#");
      } else if (event.key === "Delete" || event.key === "*") {
        handleKey("*");
      } else if (event.key === "Backspace") {
        setValue((current) => current.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  return (
    <Modal
      title={door.pinSet ? `Change the ${door.name} PIN` : `Set the ${door.name} PIN`}
      subtitle="One PIN for everyone at this door — on its keypad and in the app"
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="space-y-2 text-center">
          <p className="font-mono text-[10px] font-medium tracking-[.14em] text-muted-foreground uppercase">
            {phase === "enter" ? "Step 1 of 2 · Type the new PIN" : "Step 2 of 2 · Type it again"}
          </p>
          <PinDisplay
            length={value.length}
            minLength={PIN_MIN_LENGTH}
            maxLength={PIN_MAX_LENGTH}
            error={error !== null}
            shakeKey={shakeKey}
          />
          <p className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {saving ? (
              <span className="inline-flex items-center gap-1.5">
                <LoaderCircle className="size-3.5 animate-spin" /> Saving…
              </span>
            ) : (
              (error ?? `${PIN_MAX_LENGTH} digits, then press #. * clears.`)
            )}
          </p>
        </div>

        <Keypad onKey={handleKey} disabled={saving} />

        <p className="text-center text-xs text-muted-foreground">
          The door picks up the new PIN within a few seconds. The old one stops working.
        </p>
      </div>
    </Modal>
  );
}
