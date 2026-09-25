import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, FingerprintPattern, Menu } from "lucide-react";

import { DoorDrawer } from "@/components/DoorDrawer";
import { Keypad3D, type PadKey, type PadTone } from "@/components/Keypad3D";
import { ScrambleText } from "@/components/ScrambleText";
import { VaultLock } from "@/components/VaultLock";
import { ThemeToggle } from "@/components/ThemeToggle";
import { isFinished, useCommandTracker } from "@/hooks/useCommandTracker";
import { useNow } from "@/hooks/useNow";
import { usePolling } from "@/hooks/usePolling";
import { HttpError } from "@/lib/api";
import type { Theme } from "@/lib/theme";
import { fetchPublicDoors, fetchUnlock, unlockWithPhone, unlockWithPin } from "@/lib/unlock";
import { cn } from "@/lib/utils";
import { isCancelled, isPhoneUnlockSupported } from "@/lib/webauthn";
import type { PublicDoor } from "@/types";

// Must match PinRules on the backend.
const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 4;

const RESULT_MS = 5000;
const NOTICE_MS = 5000;
const LOCKOUT_MS = 60_000;
// Fast enough that the lock picture follows the real door almost at once.
const STATUS_POLL_MS = 250;

// Test PINs for trying the screen without a door. Dev builds only, and they
// never reach the server, so they can't open anything.
const DEMO_OPEN_PIN = "1111";
const DEMO_FAIL_PIN = "0000";
const DEMO_DELAY_MS = 900;
// Test fingerprint (dev only, skips the phone): quick tap = open, holding the
// pad this long = denied.
const DEMO_FINGER_HOLD_MS = 800;

interface Notice {
  tone: "success" | "error" | "info";
  text: string;
}

// The door picked in the sidebar, remembered on this phone. Only a
// convenience — which door opens is always shown at the top.
const PICKED_DOOR_KEY = "smart-door-picked-door";

function readPickedDoor(): string | null {
  try {
    return localStorage.getItem(PICKED_DOOR_KEY);
  } catch {
    return null;
  }
}

function savePickedDoor(id: string): void {
  try {
    localStorage.setItem(PICKED_DOOR_KEY, id);
  } catch {
    // Private mode — it just won't be remembered.
  }
}

interface KeypadPageProps {
  theme: Theme;
  onToggleTheme: () => void;
}

// The public app: no login, no names, no log. Type a PIN (or use the phone's
// fingerprint) and the door opens — that's it. Admin lives at /admin.
export function KeypadPage({ theme, onToggleTheme }: KeypadPageProps) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  // Finger resting on the fingerprint pad, or the phone's prompt is open.
  const [fingerDown, setFingerDown] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  // Last attempt was refused (wrong PIN / fingerprint) — shows DENIED.
  const [denied, setDenied] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  // All doors with their live state; the picked one lives in the sidebar.
  const [doors, setDoors] = useState<PublicDoor[] | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(readPickedDoor);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // pollMs 0: fetchUnlock waits on the server, so ask again straight away.
  const { command, track, reset } = useCommandTracker(fetchUnlock, { pollMs: 0 });
  const now = useNow(1000);
  const phoneSupported = isPhoneUnlockSupported();

  // The picked door, or the first one if nothing (valid) was picked yet.
  const door = doors?.find((candidate) => candidate.id === pickedId) ?? doors?.[0] ?? null;
  const doorId = door?.id ?? null;

  // After an app unlock, the screen shows open straight away (the door just
  // took the unlock). As soon as the door itself reports unlocked/open, it
  // "takes over": from then on only the door's report counts, so the screen
  // relocks the moment the door does — not on a timer.
  const [handedOffId, setHandedOffId] = useState<string | null>(null);
  const confirmedIdRef = useRef<string | null>(null);
  const doorIdRef = useRef<string | null>(null);
  useEffect(() => {
    doorIdRef.current = doorId;
  }, [doorId]);

  const refreshStatus = useCallback(async () => {
    try {
      const list = await fetchPublicDoors();
      setDoors(list);
      const current = list.find((candidate) => candidate.id === doorIdRef.current);
      const confirmedId = confirmedIdRef.current;
      if (confirmedId !== null && current?.online && (current.doorOpen === true || current.locked === false)) {
        setHandedOffId(confirmedId);
      }
    } catch {
      // Server unreachable: keep the names, show every door offline.
      setDoors((current) => current?.map((item) => ({ ...item, online: false, doorOpen: null, locked: null })) ?? null);
    }
  }, []);
  usePolling(refreshStatus, STATUS_POLL_MS);

  const online = door === null ? null : door.online;
  // The real door, as last reported: open (contact) or unlocked (relay).
  const doorReportsOpen = door?.online === true && (door.doorOpen === true || door.locked === false);

  const opening = command !== null && !isFinished(command.status);
  // "sent" = the door has just taken the unlock, which is when its relay
  // fires — so that already counts as open (a later failure shows FAILED).
  const unlockConfirmed =
    command?.status === "sent" || command?.status === "in_progress" || command?.status === "succeeded";

  // THE single open/closed value. The OPEN tiles, the "Unlocked" label and
  // the vault all read only this, so they always change together — whether
  // the door confirmed an app unlock, or reports it's unlocked/open (door
  // keypad, fingerprint, exit button). Closing happens together too, once
  // neither says open any more.
  const isOpen = (unlockConfirmed && handedOffId !== command?.id) || doorReportsOpen;

  useEffect(() => {
    confirmedIdRef.current = unlockConfirmed && command !== null ? command.id : null;
  }, [unlockConfirmed, command]);
  const doorFailed = command !== null && isFinished(command.status) && !unlockConfirmed;
  const locked = lockedUntil !== null && now < lockedUntil;
  const lockSeconds = lockedUntil !== null && locked ? Math.ceil((lockedUntil - now) / 1000) : 0;

  // Keep the result on screen for a few seconds, then back to the keypad.
  useEffect(() => {
    if (command === null || !isFinished(command.status)) return;
    const timer = window.setTimeout(reset, RESULT_MS);
    return () => window.clearTimeout(timer);
  }, [command, reset]);

  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => {
      setNotice(null);
      setDenied(false);
    }, NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const showError = useCallback((text: string) => {
    setNotice({ tone: "error", text });
    setShakeKey((current) => current + 1);
    navigator.vibrate?.([30, 40, 30]);
  }, []);

  const handleError = useCallback(
    (err: unknown) => {
      if (isCancelled(err)) {
        setNotice({ tone: "info", text: "Cancelled" });
      } else if (err instanceof HttpError && err.status === 429) {
        setLockedUntil(Date.now() + LOCKOUT_MS);
        showError("Too many tries. Wait a minute.");
      } else if (err instanceof HttpError && err.status < 500) {
        // 400 = the PIN or fingerprint itself was refused.
        setDenied(err.status === 400);
        showError(err.message);
      } else {
        showError("Couldn't reach the door. Try again.");
      }
    },
    [showError],
  );

  const submit = useCallback(
    async (value: string) => {
      if (value.length < PIN_MIN_LENGTH) {
        showError(`PIN is ${PIN_MAX_LENGTH} digits`);
        return;
      }

      setBusy(true);
      setNotice(null);
      try {
        if (import.meta.env.DEV && (value === DEMO_OPEN_PIN || value === DEMO_FAIL_PIN)) {
          await new Promise((resolve) => window.setTimeout(resolve, DEMO_DELAY_MS));
          if (value === DEMO_OPEN_PIN) track({ id: `demo-${Date.now()}`, status: "succeeded", message: null });
          else {
            setDenied(true);
            showError("Wrong PIN.");
          }
          return;
        }
        if (doorId === null) {
          showError("No door to open yet.");
          return;
        }
        track(await unlockWithPin(doorId, value));
      } catch (err) {
        handleError(err);
      } finally {
        setBusy(false);
        setPin("");
      }
    },
    [doorId, track, showError, handleError],
  );

  const handleKey = useCallback(
    (key: PadKey) => {
      if (command !== null && isFinished(command.status)) reset();
      setDenied(false);
      if (key === "enter") {
        void submit(pin);
        return;
      }
      setNotice(null);
      if (key === "back") {
        setPin((current) => current.slice(0, -1));
        return;
      }
      setPin((current) => (current.length < PIN_MAX_LENGTH ? current + key : current));
    },
    [command, reset, submit, pin],
  );

  const fingerDownAt = useRef(0);

  const openWithPhone = async () => {
    const heldMs = Date.now() - fingerDownAt.current;
    reset();
    setDenied(false);
    setBusy(true);
    setScanning(true);
    setNotice(null);
    try {
      if (import.meta.env.DEV) {
        await new Promise((resolve) => window.setTimeout(resolve, DEMO_DELAY_MS));
        if (heldMs < DEMO_FINGER_HOLD_MS) {
          track({ id: `demo-${Date.now()}`, status: "succeeded", message: null });
        } else {
          setDenied(true);
          showError("Fingerprint not accepted. Try again.");
        }
        return;
      }
      if (doorId === null) {
        showError("No door to open yet.");
        return;
      }
      track(await unlockWithPhone(doorId));
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
      setScanning(false);
    }
  };

  // Switch door from the sidebar: forget anything typed or shown for the
  // previous door, and remember the choice on this phone.
  const pickDoor = (id: string) => {
    savePickedDoor(id);
    setPickedId(id);
    reset();
    setPin("");
    setNotice(null);
    setDenied(false);
    setDrawerOpen(false);
  };

  const errorShown = doorFailed || notice?.tone === "error";
  const tone: PadTone = isOpen ? "success" : errorShown ? "error" : "idle";

  const hint = locked
    ? `Too many tries — wait ${lockSeconds}s`
    : (notice?.text ??
      (doorFailed
        ? (command?.message ?? "The door didn't respond")
        : scanning
          ? "Check your phone…"
          : "Type your PIN, then press →"));

  const screen = (
    <div className="space-y-[clamp(4px,1dvh,12px)]">
      <div className="flex items-center justify-between font-mono text-[10px] font-medium tracking-[.16em] uppercase">
        <span className="text-muted-foreground">Enter PIN</span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span
            className={cn(
              "size-1.5 rounded-full",
              online === null ? "bg-muted-foreground" : online ? "bg-success" : "bg-destructive",
            )}
          />
          {online === null
            ? "…"
            : !online
              ? "Door offline"
              : door?.doorOpen
                ? "Door open"
                : isOpen
                  ? "Unlocked"
                  : "Locked"}
        </span>
      </div>

      <div className="flex h-[calc(var(--tile-h)+12px)] items-center justify-center">
        {/* One component through checking → result, so the flicker flows
            straight into the answer. */}
        {busy || opening || isOpen || doorFailed || denied ? (
          <ScrambleText
            target={isOpen ? "OPEN" : doorFailed ? "FAILED" : denied ? "DENIED" : null}
            tone={isOpen ? "success" : doorFailed || denied ? "error" : "idle"}
          />
        ) : (
          <div key={shakeKey} className={cn("flex gap-2.5", shakeKey > 0 && "animate-pin-shake")}>
            {Array.from({ length: PIN_MAX_LENGTH }, (_, index) => {
              const filled = index < pin.length;
              const optional = index >= PIN_MIN_LENGTH;
              return (
                <span
                  key={index}
                  className={cn(
                    "size-3.5 rounded-full border-2 transition-all duration-150",
                    optional && !filled ? "border-dashed" : "border-solid",
                    errorShown
                      ? "border-destructive bg-destructive/80"
                      : filled
                        ? "scale-110 border-foreground bg-foreground"
                        : "border-muted-foreground/50",
                  )}
                />
              );
            })}
          </div>
        )}
      </div>

      <p
        className={cn(
          "min-h-8 text-center text-xs leading-4 short-landscape:min-h-4",
          errorShown || locked
            ? "text-destructive"
            : notice?.tone === "success"
              ? "text-success"
              : isOpen
                ? "text-success"
                : "text-muted-foreground",
        )}
      >
        {isOpen ? "Push the door within 5 seconds" : hint}
      </p>
    </div>
  );

  return (
    // Exactly one screen tall and never scrolls — sizes come from the screen
    // (see .keypad-page / .keypad-layout in index.css).
    <div className="keypad-page flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex flex-none items-center justify-between gap-2 px-3 pt-[max(clamp(6px,1.5dvh,16px),env(safe-area-inset-top))] sm:px-6">
        {/* The door you're about to open — tap to change it (sidebar). */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Choose door"
          className="flex min-w-0 items-center gap-2.5 rounded-[12px] py-1 pr-2 text-left hover:bg-secondary/60"
        >
          <span className="flex size-8 flex-none items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
            <Menu className="size-4" strokeWidth={2.25} />
          </span>
          <span className="min-w-0 truncate text-base font-extrabold tracking-tight uppercase">
            {door?.name ?? "Smart Door"}
          </span>
          <ChevronDown className="size-4 flex-none text-muted-foreground" />
        </button>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <DoorDrawer
        open={drawerOpen}
        doors={doors ?? []}
        pickedId={doorId}
        onPick={pickDoor}
        onClose={() => setDrawerOpen(false)}
      />

      <main className="keypad-layout min-h-0 flex-1 px-4 pb-[max(clamp(6px,1.5dvh,16px),env(safe-area-inset-bottom))]">
        <div className="flex w-full justify-center [grid-area:vault]">
          <VaultLock
            state={isOpen ? "open" : errorShown ? "error" : busy || opening ? "working" : "idle"}
            digits={pin.length}
            shakeKey={shakeKey}
          />
        </div>
        <div className="flex w-full justify-center self-center [grid-area:pad]">
          <Keypad3D screen={screen} tone={tone} disabled={busy || opening || locked} onKey={handleKey} />
        </div>

        {phoneSupported && (
          // Just a pad to put your finger on. Pulses while pressed and while
          // the phone is reading the fingerprint.
          <button
            type="button"
            aria-label="Open with phone fingerprint"
            disabled={busy || opening || locked}
            onPointerDown={() => {
              fingerDownAt.current = Date.now();
              setFingerDown(true);
            }}
            onPointerUp={() => setFingerDown(false)}
            onPointerLeave={() => setFingerDown(false)}
            onPointerCancel={() => setFingerDown(false)}
            onContextMenu={(event) => event.preventDefault()}
            onClick={() => void openWithPhone()}
            className="relative flex size-[var(--finger)] items-center justify-center rounded-full select-none [grid-area:finger]"
          >
            {(fingerDown || scanning) && (
              <>
                <span className="pointer-events-none absolute inset-0 rounded-full bg-primary/40 animate-gc-pulse" />
                <span className="pointer-events-none absolute inset-0 rounded-full bg-primary/25 animate-gc-pulse [animation-delay:0.7s]" />
              </>
            )}
            <span
              data-down={fingerDown}
              className="key3d key3d-primary relative flex size-full items-center justify-center rounded-full text-primary-foreground"
            >
              <FingerprintPattern className="size-[45%]" strokeWidth={1.75} />
            </span>
          </button>
        )}

        {/* People, PINs and fingerprints are all set up in the admin dashboard. */}
        <p className="text-center text-[11px] text-muted-foreground [grid-area:note]">Not registered? Contact the admin.</p>
      </main>
    </div>
  );
}
