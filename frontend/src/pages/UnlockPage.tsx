import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, DoorClosed, DoorOpen, KeyRound, LoaderCircle, Lock, LockOpen, LogOut, WifiOff } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { isFinished, useCommandTracker } from "@/hooks/useCommandTracker";
import { useMemberAuth } from "@/hooks/useMemberAuth";
import { useNow } from "@/hooks/useNow";
import { usePolling } from "@/hooks/usePolling";
import { errorMessage } from "@/lib/api";
import { fetchMyProfile, fetchMyUnlock, unlockMyDoor } from "@/lib/member";
import { formatClock, isInsideOpenHours } from "@/lib/schedule";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { UnlockPinDialog } from "@/pages/AccountPage";
import { LoginPage } from "@/pages/LoginPage";
import type { MemberDoor, MemberProfile } from "@/types";

const PROFILE_POLL_MS = 1500;
const RESULT_SHOWN_MS = 5000;
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

interface UnlockPageProps {
  theme: Theme;
  onToggleTheme: () => void;
}

// "/" — the simple page: sign in once, see whether the door is locked, press
// Unlock. Doors that need a PIN ask for it first. The old PIN keypad lives at
// /keypad.
export function UnlockPage({ theme, onToggleTheme }: UnlockPageProps) {
  const { isAuthenticated, login, logout } = useMemberAuth();

  if (!isAuthenticated) {
    return (
      <LoginPage
        onLogin={login}
        theme={theme}
        onToggleTheme={onToggleTheme}
        subtitle="Sign in to unlock your door"
      />
    );
  }

  return <UnlockHome onLogout={logout} theme={theme} onToggleTheme={onToggleTheme} />;
}

function UnlockHome({
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(readPickedDoor);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const { command, track, reset } = useCommandTracker(fetchMyUnlock, { pollMs: 0 });

  const loadProfile = useCallback(async () => {
    try {
      setProfile(await fetchMyProfile());
      setLoadError(null);
    } catch {
      setLoadError("Couldn't reach the server");
    }
  }, []);
  usePolling(loadProfile, PROFILE_POLL_MS);

  useEffect(() => {
    if (command === null || !isFinished(command.status)) return;
    const timer = window.setTimeout(reset, RESULT_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [command, reset]);

  useEffect(() => {
    if (requestError === null) return;
    const timer = window.setTimeout(() => setRequestError(null), RESULT_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [requestError]);

  const doors = profile?.doors ?? [];
  const door: MemberDoor | null = doors.find((candidate) => candidate.id === pickedId) ?? doors[0] ?? null;

  const opening = command !== null && !isFinished(command.status);
  const unlockConfirmed =
    command?.status === "sent" || command?.status === "in_progress" || command?.status === "succeeded";
  const failed = command !== null && isFinished(command.status) && !unlockConfirmed;

  const offline = door !== null && !door.online;
  const doorOpen = door?.online === true && door.doorOpen === true;
  const unlocked = door?.online === true && door.locked === false;
  const isOpen = doorOpen || unlocked || unlockConfirmed;

  // Unlocked because it is working hours (the door's weekly open hours), not
  // because someone just pressed Unlock: nothing to press until it locks again.
  const workingHours = door !== null && !offline && isOpen && !opening && isInsideOpenHours(door.schedule, now);

  const stateText = door === null ? "" : offline ? "Offline" : workingHours ? "Working hours" : doorOpen ? "Door open" : isOpen ? "Unlocked" : "Locked";
  const blocked = door === null || offline || (door.pinRequired && !door.pinSet);

  const startUnlock = useCallback(
    async (target: MemberDoor, pin?: string): Promise<string | null> => {
      setRequestError(null);
      try {
        track(await unlockMyDoor(target, pin));
        return null;
      } catch (err) {
        const text = errorMessage(err, "Couldn't reach the door. Try again.");
        setRequestError(text);
        return text;
      }
    },
    [track],
  );

  const press = () => {
    if (door === null) return;
    if (door.pinRequired) setPinOpen(true);
    else void startUnlock(door);
  };

  const pick = (id: string) => {
    savePickedDoor(id);
    setPickedId(id);
    setChooserOpen(false);
    reset();
    setRequestError(null);
  };

  const StatusIcon = offline ? WifiOff : doorOpen ? DoorOpen : isOpen ? LockOpen : Lock;

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex flex-none items-center justify-between gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="relative min-w-0">
          <button
            type="button"
            onClick={() => doors.length > 1 && setChooserOpen((current) => !current)}
            aria-label="Choose door"
            className="flex min-w-0 items-center gap-2.5 rounded-[12px] py-1 pr-2 text-left hover:bg-secondary/60"
          >
            <span className="flex size-8 flex-none items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
              <DoorClosed className="size-4" strokeWidth={2.25} />
            </span>
            <span className="min-w-0 truncate text-base font-extrabold tracking-tight uppercase">
              {door?.name ?? "Smart Door"}
            </span>
            {doors.length > 1 && <ChevronDown className="size-4 flex-none text-muted-foreground" />}
          </button>
          {chooserOpen && (
            <div className="absolute top-full left-0 z-10 mt-1 w-64 space-y-1 rounded-[14px] border border-border bg-card p-1.5 shadow-lg">
              {doors.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => pick(candidate.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 text-left text-sm font-semibold hover:bg-secondary",
                    candidate.id === door?.id && "bg-secondary",
                  )}
                >
                  <span className={cn("size-2 flex-none rounded-full", candidate.online ? "bg-success" : "bg-destructive")} />
                  <span className="truncate">{candidate.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-none items-center gap-2">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <Button variant="outline" size="icon" onClick={onLogout} aria-label="Sign out">
            <LogOut />
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-6 pb-[max(24px,env(safe-area-inset-bottom))]">
        {profile === null ? (
          <p className="text-sm text-muted-foreground">{loadError ?? "Loading…"}</p>
        ) : door === null ? (
          <p className="max-w-xs text-center text-sm text-muted-foreground">
            You can't open any door yet. Ask your admin to switch one on for you.
          </p>
        ) : (
          <>
            <div className="flex flex-col items-center gap-4">
              <div
                className={cn(
                  "flex size-40 items-center justify-center rounded-full border-4 transition-colors duration-300",
                  offline
                    ? "border-muted-foreground/40 bg-secondary text-muted-foreground"
                    : isOpen
                      ? "border-success bg-success/15 text-success"
                      : "border-destructive bg-destructive/10 text-destructive",
                )}
              >
                <StatusIcon className="size-16" strokeWidth={1.75} />
              </div>
              <p
                className={cn(
                  "flex items-center gap-2 text-3xl font-extrabold tracking-tight uppercase",
                  offline ? "text-muted-foreground" : isOpen ? "text-success" : "text-destructive",
                )}
              >
                {stateText}
              </p>
              <p className="min-h-4 text-center text-xs text-muted-foreground">
                {opening
                  ? "Opening…"
                  : workingHours && door
                    ? `Door stays unlocked until ${formatClock(door.schedule.until)}`
                    : isOpen && !offline
                    ? "Push the door within 5 seconds"
                    : offline
                      ? "This door is offline right now"
                      : door.pinRequired && !door.pinSet
                        ? "This door has no PIN yet. Ask your admin."
                        : ""}
              </p>
            </div>

            <div className="w-full max-w-xs space-y-3">
              {workingHours && door ? (
                <div
                  role="status"
                  className="flex h-16 w-full items-center justify-center gap-2 rounded-[18px] border border-success/40 bg-success/15 text-lg font-extrabold text-success uppercase"
                >
                  <Check className="size-5" strokeWidth={3} />
                  Open until {formatClock(door.schedule.until)}
                </div>
              ) : isOpen && !opening && !offline ? (
                // Already open: no second press needed, so the button turns
                // into a calm "done" state instead of offering Unlock again.
                <div
                  role="status"
                  className="flex h-16 w-full items-center justify-center gap-2 rounded-[18px] border border-success/40 bg-success/15 text-lg font-extrabold text-success uppercase"
                >
                  <Check className="size-5" strokeWidth={3} />
                  {doorOpen ? "Door is open" : "Door unlocked"}
                </div>
              ) : (
                <Button
                  className="h-16 w-full rounded-[18px] text-lg font-extrabold uppercase"
                  disabled={blocked || opening}
                  onClick={press}
                >
                  {opening ? <LoaderCircle className="animate-spin" /> : door.pinRequired ? <KeyRound /> : <LockOpen />}
                  {opening ? "Opening…" : "Unlock"}
                </Button>
              )}
              {failed && <p className="text-center text-xs text-destructive">{command?.message ?? "The door didn't respond."}</p>}
              {requestError && <p className="text-center text-xs text-destructive">{requestError}</p>}
              {loadError && <p className="text-center text-xs text-destructive">{loadError}</p>}
            </div>
          </>
        )}
      </main>

      {pinOpen && door && (
        <UnlockPinDialog
          door={door}
          onClose={() => setPinOpen(false)}
          onSubmit={async (pin) => {
            const problem = await startUnlock(door, pin);
            if (problem === null) setPinOpen(false);
            return problem;
          }}
        />
      )}
    </div>
  );
}
