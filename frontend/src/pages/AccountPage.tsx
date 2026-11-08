import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CalendarClock,
  DoorClosed,
  DoorOpen,
  KeyRound,
  LoaderCircle,
  Lock,
  LockOpen,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { EventRow } from "@/components/EventRow";
import { Keypad, PinDisplay, type KeypadKey } from "@/components/Keypad";
import { Modal } from "@/components/Modal";
import { SectionHeading } from "@/components/SectionLabel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isFinished, useCommandTracker } from "@/hooks/useCommandTracker";
import { useMemberAuth } from "@/hooks/useMemberAuth";
import { useNow } from "@/hooks/useNow";
import { usePolling } from "@/hooks/usePolling";
import { errorMessage } from "@/lib/api";
import { formatAgo } from "@/lib/format";
import { changeMyPassword, fetchMyActivity, fetchMyProfile, fetchMyUnlock, unlockMyDoor } from "@/lib/member";
import { describeSchedule, isInsideOpenHours } from "@/lib/schedule";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { LoginPage } from "@/pages/LoginPage";
import type { AccessEvent, MemberDoor, MemberProfile } from "@/types";

const PROFILE_POLL_MS = 3000;
const ACTIVITY_POLL_MS = 15000;
const PIN_LENGTH = 4;
const MIN_PASSWORD_LENGTH = 6;
const RESULT_SHOWN_MS = 6000;

interface AccountPageProps {
  theme: Theme;
  onToggleTheme: () => void;
}

// /account — a person signs in with the username and password the admin made
// for them, sees their doors, and opens them. Doors that require a PIN ask for
// it; doors that don't just open when the button is pressed.
export function AccountPage({ theme, onToggleTheme }: AccountPageProps) {
  const { isAuthenticated, login, logout } = useMemberAuth();

  if (!isAuthenticated) {
    return (
      <LoginPage
        onLogin={login}
        theme={theme}
        onToggleTheme={onToggleTheme}
        subtitle="Sign in to open your doors from your phone"
      />
    );
  }

  return <AccountHome onLogout={logout} theme={theme} onToggleTheme={onToggleTheme} />;
}

function AccountHome({
  onLogout,
  theme,
  onToggleTheme,
}: {
  onLogout: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const now = useNow(15000);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [activity, setActivity] = useState<AccessEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pinFor, setPinFor] = useState<MemberDoor | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);

  // Which door the last unlock was for, and how it went.
  const [activeDoorId, setActiveDoorId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<{ doorId: string; text: string } | null>(null);
  const { command, track, reset } = useCommandTracker(fetchMyUnlock, { pollMs: 0 });

  const loadProfile = useCallback(async () => {
    try {
      setProfile(await fetchMyProfile());
      setLoadError(null);
    } catch {
      setLoadError("Couldn't reach the server");
    }
  }, []);
  const loadActivity = useCallback(async () => {
    try {
      setActivity(await fetchMyActivity(30));
    } catch {
      // Keep the last list.
    }
  }, []);
  usePolling(loadProfile, PROFILE_POLL_MS);
  usePolling(loadActivity, ACTIVITY_POLL_MS);

  // A finished result stays on screen for a few seconds, then clears.
  useEffect(() => {
    if (command === null || !isFinished(command.status)) return;
    const timer = window.setTimeout(() => {
      reset();
      setActiveDoorId(null);
      void loadActivity();
    }, RESULT_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [command, reset, loadActivity]);

  useEffect(() => {
    if (requestError === null) return;
    const timer = window.setTimeout(() => setRequestError(null), RESULT_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [requestError]);

  const busy = command !== null && !isFinished(command.status);

  // Returns an error message to show in the PIN dialog, or null when started.
  const startUnlock = useCallback(
    async (door: MemberDoor, pin?: string): Promise<string | null> => {
      setRequestError(null);
      try {
        const started = await unlockMyDoor(door, pin);
        setActiveDoorId(door.id);
        track(started);
        return null;
      } catch (err) {
        const text = errorMessage(err, "Couldn't reach the door. Try again.");
        setRequestError({ doorId: door.id, text });
        return text;
      }
    },
    [track],
  );

  const press = (door: MemberDoor) => {
    if (door.pinRequired) {
      setPinFor(door);
    } else {
      void startUnlock(door);
    }
  };

  return (
    <div className="min-h-dvh bg-background pb-10 text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-primary text-primary-foreground">
              <DoorClosed className="size-5" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl leading-tight font-extrabold tracking-tight">
                {profile ? `Hi, ${profile.name}` : "Smart Door"}
              </h1>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {profile ? `@${profile.username}` : "Your doors"}
              </p>
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <Button variant="outline" size="icon" onClick={() => setPasswordOpen(true)} aria-label="My password">
              <UserRound />
            </Button>
            <Button variant="outline" size="icon" onClick={onLogout} aria-label="Sign out">
              <LogOut />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-8 px-4 py-6">
        {loadError && <p className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">{loadError}</p>}

        <section className="space-y-3">
          <SectionHeading label="Your doors" title="Tap to unlock" />
          {profile === null ? (
            <p className="text-sm text-muted-foreground">Loading your doors…</p>
          ) : profile.doors.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              You can't open any door yet. Ask your admin to switch one on for you.
            </div>
          ) : (
            profile.doors.map((door) => (
              <AccountDoorCard
                key={door.id}
                door={door}
                now={now}
                disabled={busy}
                status={activeDoorId === door.id ? command : null}
                error={requestError?.doorId === door.id ? requestError.text : null}
                onPress={() => press(door)}
              />
            ))
          )}
        </section>

        {profile && (
          <section className="space-y-3">
            <SectionHeading label="Your account" title="What is set up" />
            <div className="grid grid-cols-3 gap-2">
              <Fact label="Doors" value={String(profile.doors.length)} />
              <Fact label="Phones" value={String(profile.phones)} />
              <Fact label="Fingers" value={String(profile.fingerprints)} />
            </div>
            <p className="text-xs text-muted-foreground">
              {profile.lastLoginAt ? `Signed in ${formatAgo(profile.lastLoginAt, now)}. ` : ""}
              Your password is shown as {profile.passwordHint ?? "—"}.
            </p>
          </section>
        )}

        <section className="space-y-3">
          <SectionHeading label="Your activity" title="Recent" />
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet — your opens and sign-ins show up here.</p>
          ) : (
            <div className="space-y-2">
              {activity.slice(0, 12).map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </div>
          )}
        </section>
      </main>

      {pinFor && (
        <UnlockPinDialog
          door={pinFor}
          onClose={() => setPinFor(null)}
          onSubmit={async (pin) => {
            const problem = await startUnlock(pinFor, pin);
            if (problem === null) setPinFor(null);
            return problem;
          }}
        />
      )}

      {passwordOpen && <PasswordDialog onClose={() => setPasswordOpen(false)} onChanged={(next) => setProfile(next)} />}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-border bg-card p-3 text-center">
      <p className="text-2xl font-extrabold tracking-tight tabular-nums">{value}</p>
      <p className="font-mono text-[10px] tracking-[.12em] text-muted-foreground uppercase">{label}</p>
    </div>
  );
}

interface AccountDoorCardProps {
  door: MemberDoor;
  now: number;
  disabled: boolean;
  status: { status: string; message: string | null } | null;
  error: string | null;
  onPress: () => void;
}

function AccountDoorCard({ door, now, disabled, status, error, onPress }: AccountDoorCardProps) {
  const insideHours = isInsideOpenHours(door.schedule, now);
  const opening = status !== null && !["succeeded", "failed", "expired", "cancelled"].includes(status.status);
  const succeeded = status?.status === "succeeded";
  const failed = status !== null && !opening && !succeeded;

  const stateText = !door.online
    ? "Offline"
    : door.doorOpen
      ? "Door open"
      : door.locked === false
        ? "Unlocked"
        : "Locked";
  const LockIcon = door.locked === false ? LockOpen : Lock;

  const blocked = !door.online || (door.pinRequired && !door.pinSet);

  return (
    <div className="space-y-3 rounded-[20px] border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-11 flex-none items-center justify-center rounded-[12px]",
            door.online ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
          )}
        >
          {door.doorOpen ? <DoorOpen className="size-5" /> : <DoorClosed className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold tracking-tight">{door.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("size-2 rounded-full", door.online ? "bg-success" : "bg-destructive")} />
            {stateText}
            <LockIcon className="size-3" />
          </p>
        </div>
      </div>

      <div className="space-y-1.5 rounded-[14px] bg-secondary/60 p-3 text-xs text-muted-foreground">
        <p className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 size-3.5 flex-none" />
          <span>
            {describeSchedule(door.schedule)}
            {door.schedule.enabled && (
              <span className={cn("ml-1 font-semibold", insideHours ? "text-success" : "text-foreground")}>
                · {insideHours ? "open now" : "closed now"}
              </span>
            )}
          </span>
        </p>
        <p className="flex items-start gap-2">
          {door.pinRequired ? <KeyRound className="mt-0.5 size-3.5 flex-none" /> : <ShieldCheck className="mt-0.5 size-3.5 flex-none" />}
          <span>{door.pinRequired ? "Asks for the door PIN when you unlock" : "One tap — no PIN needed"}</span>
        </p>
      </div>

      <Button
        className="h-12 w-full rounded-[14px] text-sm font-extrabold uppercase"
        disabled={disabled || blocked}
        onClick={onPress}
      >
        {opening ? (
          <LoaderCircle className="animate-spin" />
        ) : succeeded ? (
          <DoorOpen />
        ) : door.pinRequired ? (
          <KeyRound />
        ) : (
          <LockOpen />
        )}
        {opening ? "Opening…" : succeeded ? "Unlocked" : door.pinRequired ? "Enter PIN to unlock" : "Unlock"}
      </Button>

      {!door.online && <p className="text-xs text-muted-foreground">This door is offline right now.</p>}
      {door.online && door.pinRequired && !door.pinSet && (
        <p className="text-xs text-muted-foreground">This door has no PIN yet. Ask your admin to set one.</p>
      )}
      {failed && <p className="text-xs text-destructive">{status?.message ?? "The door didn't respond."}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

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

function PasswordDialog({ onClose, onChanged }: { onClose: () => void; onChanged: (profile: MemberProfile) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const mismatch = again.length > 0 && next !== again;
  const canSave = current.length > 0 && next.length >= MIN_PASSWORD_LENGTH && next === again && !saving;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      onChanged(await changeMyPassword(current, next));
      setCurrent("");
      setNext("");
      setAgain("");
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err, "Couldn't change the password. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, value: string, set: (value: string) => void, autoComplete: string, autoFocus = false) => (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] font-medium tracking-[.14em] text-muted-foreground uppercase">{label}</span>
      <Input
        type="password"
        required
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        maxLength={64}
        value={value}
        onChange={(event) => set(event.target.value)}
        className="h-11 rounded-[14px] px-3.5"
      />
    </label>
  );

  return (
    <Modal title="Change my password" subtitle="Used to sign in on this page" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="space-y-3">
        {field("Current password", current, setCurrent, "current-password", true)}
        {field("New password", next, setNext, "new-password")}
        {field("New password again", again, setAgain, "new-password")}
        {tooShort && <p className="text-xs text-destructive">At least {MIN_PASSWORD_LENGTH} characters.</p>}
        {mismatch && <p className="text-xs text-destructive">The two new passwords don't match.</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {saved && <p className="rounded-[12px] bg-success/15 px-3 py-2 text-sm text-success">Password changed.</p>}
        <Button type="submit" className="h-11 w-full rounded-[14px] text-sm font-extrabold uppercase" disabled={!canSave}>
          {saving && <LoaderCircle className="animate-spin" />}
          Change password
        </Button>
      </form>
    </Modal>
  );
}
