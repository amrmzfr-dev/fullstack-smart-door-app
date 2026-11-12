import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Check, KeyRound, LayoutGrid, LoaderCircle, Lock, LockOpen, WifiOff } from "lucide-react";

import { ADMIN_SECTIONS, AdminSections, type AdminSection } from "@/components/AdminSections";
import { AppShell, type NavItem } from "@/components/AppShell";
import { UnlockPinDialog } from "@/components/UnlockPinDialog";
import { isFinished, useCommandTracker } from "@/hooks/useCommandTracker";
import { useMemberAuth } from "@/hooks/useMemberAuth";
import { useNow } from "@/hooks/useNow";
import { usePolling } from "@/hooks/usePolling";
import { errorMessage } from "@/lib/api";
import { clearSession, setSession } from "@/lib/auth";
import { METHOD_LABELS } from "@/lib/events";
import { formatClockTime, initials } from "@/lib/format";
import { fetchMyActivity, fetchMyAdminToken, fetchMyProfile, fetchMyUnlock, unlockMyDoor } from "@/lib/member";
import { describeSchedule, formatClock, isInsideOpenHours, openHoursProgress } from "@/lib/schedule";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { LoginPage } from "@/pages/LoginPage";
import type { AccessEvent, MemberDoor, MemberProfile } from "@/types";

const PROFILE_POLL_MS = 1500;
const ACTIVITY_POLL_MS = 20000;
const RESULT_SHOWN_MS = 5000;
const RECENT_COUNT = 3;
// The admin sign-in lasts a day; ask for a fresh one every hour.
const ADMIN_TOKEN_REFRESH_MS = 3_600_000;
const PICKED_DOOR_KEY = "smart-door-picked-door";

type View = "unlock" | AdminSection;

const NAV_ITEMS: ReadonlyArray<NavItem<View>> = [{ key: "unlock", label: "Unlock", icon: LockOpen }, ...ADMIN_SECTIONS];

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });

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
// /keypad. People with admin access also get the admin pages in the bottom bar.
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

  return <UnlockHome onLogout={() => {
    clearSession();
    logout();
  }} theme={theme} onToggleTheme={onToggleTheme} />;
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
  const [activity, setActivity] = useState<AccessEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(readPickedDoor);
  const [pinOpen, setPinOpen] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  // "unlock" = this page; otherwise an admin page (only for people with admin access).
  const [view, setView] = useState<View>("unlock");
  const [adminReady, setAdminReady] = useState(false);
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

  const loadActivity = useCallback(async () => {
    try {
      setActivity(await fetchMyActivity(40));
    } catch {
      // Keep the last list.
    }
  }, []);
  usePolling(loadActivity, ACTIVITY_POLL_MS);

  const isAdmin = profile?.isAdmin === true;
  const refreshAdminToken = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { token, username } = await fetchMyAdminToken();
      setSession(token, username);
      setAdminReady(true);
    } catch {
      // Keep whatever sign-in we had; the admin pages show the error.
    }
  }, [isAdmin]);
  usePolling(refreshAdminToken, ADMIN_TOKEN_REFRESH_MS);

  // Admin access taken away: drop the admin sign-in and go back to Unlock.
  useEffect(() => {
    if (profile !== null && !profile.isAdmin && adminReady) {
      clearSession();
      setAdminReady(false);
      setView("unlock");
    }
  }, [profile, adminReady]);

  useEffect(() => {
    if (command === null || !isFinished(command.status)) return;
    const timer = window.setTimeout(() => {
      reset();
      void loadActivity();
    }, RESULT_SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [command, reset, loadActivity]);

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

  const stateText =
    door === null ? "" : offline ? "Offline" : workingHours ? "Working hours" : doorOpen ? "Door open" : isOpen ? "Unlocked" : "Locked";
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
    reset();
    setRequestError(null);
  };

  const progress = door && door.schedule.enabled ? openHoursProgress(door.schedule, now) : null;
  const recent = door ? activity.filter((event) => event.type === "granted" && event.doorId === door.id).slice(0, RECENT_COUNT) : [];

  const subText = opening
    ? "Opening…"
    : workingHours && door
      ? `Door remains unlocked until ${formatClock(door.schedule.until)}`
      : isOpen && !offline
        ? "Push the door within 5 seconds"
        : offline
          ? "This door is offline right now"
          : door && door.pinRequired && !door.pinSet
            ? "This door has no PIN yet. Ask your admin."
            : door && door.schedule.enabled
              ? describeSchedule(door.schedule)
              : "Tap Unlock to open the door";

  const HeroIcon = offline ? WifiOff : isOpen ? LockOpen : Lock;

  return (
    <AppShell
      name={profile?.name ?? "there"}
      theme={theme}
      onToggleTheme={onToggleTheme}
      onLogout={onLogout}
      nav={isAdmin ? { items: NAV_ITEMS, active: view, onGo: setView } : undefined}
    >
      {view !== "unlock" ? (
        isAdmin && adminReady ? (
          <AdminSections section={view} onGo={setView} />
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">Opening the admin panel…</p>
        )
      ) : profile === null ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{loadError ?? "Loading…"}</p>
      ) : door === null ? (
        <p className="mx-auto max-w-xs py-16 text-center text-sm text-muted-foreground">
          You can't open any door yet. Ask your admin to switch one on for you.
        </p>
      ) : (
        <div className="flex flex-col gap-[18px]">
          {doors.length > 1 && (
            <div className="-mx-[18px] flex gap-2 overflow-x-auto px-[18px] py-0.5">
              {doors.map((candidate) => {
                const on = candidate.id === door.id;
                const candidateOpen = candidate.online && candidate.locked === false;
                const ChipIcon = !candidate.online ? WifiOff : candidateOpen ? LockOpen : Lock;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => pick(candidate.id)}
                    className={cn(
                      "flex h-[42px] flex-none items-center gap-2 rounded-full py-0 pr-1.5 pl-4 text-[13px] whitespace-nowrap transition-colors",
                      on
                        ? "bg-primary font-medium text-primary-foreground"
                        : "border border-border bg-card text-muted-foreground",
                    )}
                  >
                    {candidate.name}
                    <span
                      className={cn(
                        "flex size-[30px] items-center justify-center rounded-full",
                        on ? "bg-white text-primary" : "bg-secondary",
                      )}
                    >
                      <ChipIcon className="size-3.5" strokeWidth={2} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Hero: big lock, state in words, open-hours bar */}
          <div className="relative overflow-hidden rounded-[28px] bg-primary px-[18px] pt-[18px] pb-[22px] text-primary-foreground">
            <span className="pointer-events-none absolute -top-[150px] -right-[150px] size-80 rounded-full border-[1.5px] border-white/15" />
            <span className="pointer-events-none absolute -top-[100px] -right-[100px] size-[220px] rounded-full border-[1.5px] border-white/15" />
            <span className="pointer-events-none absolute -bottom-[170px] -left-[170px] size-[280px] rounded-full border-[1.5px] border-white/10" />

            <div className="relative flex items-center justify-between">
              <span className="rounded-full bg-white/15 px-3 py-[7px] text-xs whitespace-nowrap">
                {DATE_FORMAT.format(now)}
              </span>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => setView("doors")}
                  aria-label="Open the Doors page"
                  className="flex size-[38px] items-center justify-center rounded-full border border-white/45 text-white transition-colors hover:bg-white/10"
                >
                  <ArrowUpRight className="size-4" strokeWidth={2} />
                </button>
              ) : (
                <span className="rounded-full bg-white/15 px-3 py-[7px] text-xs whitespace-nowrap">{door.name}</span>
              )}
            </div>

            <div className="relative flex flex-col items-center gap-4 pt-1.5 pb-1 text-center">
              <div className="relative flex size-[170px] items-center justify-center">
                {(isOpen || opening) && (
                  <>
                    <span className="animate-ring-pulse absolute inset-5 rounded-full border-2 border-white/55" />
                    <span className="animate-ring-pulse absolute inset-5 rounded-full border-2 border-white/55 [animation-delay:1.2s]" />
                  </>
                )}
                <div className="relative flex size-[130px] items-center justify-center rounded-full bg-white shadow-[0_14px_30px_rgba(8,30,110,.3)]">
                  {opening ? (
                    <LoaderCircle className="size-[50px] animate-spin text-primary" strokeWidth={1.8} />
                  ) : (
                    <HeroIcon
                      className={cn("size-[50px]", offline ? "text-slate-400" : isOpen ? "text-success" : "text-slate-900")}
                      strokeWidth={1.8}
                    />
                  )}
                </div>
              </div>
              <div>
                <div className="text-[32px] leading-[1.1] font-semibold tracking-[-.02em]">{opening ? "Opening…" : stateText}</div>
                <div className="mt-1.5 text-[13px] opacity-85">{subText}</div>
              </div>
            </div>

            {door.schedule.enabled && !offline && (
              <div className="relative mt-[18px]">
                <div className="h-2 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-white" style={{ width: `${progress?.percent ?? 0}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-[11px] opacity-85">
                  <span>{door.schedule.from}</span>
                  <span>{progress?.remaining ?? "Closed"}</span>
                  <span>{door.schedule.until}</span>
                </div>
              </div>
            )}
          </div>

          {/* The one button. Already open: a calm status pill instead. */}
          <div className="flex flex-col gap-2">
            {workingHours ? (
              <div
                role="status"
                className="flex h-[58px] items-center justify-center gap-2.5 rounded-full bg-success/15 text-[15px] font-semibold text-success"
              >
                <Check className="size-[19px]" strokeWidth={2.5} />
                Unlocked until {formatClock(door.schedule.until)}
              </div>
            ) : isOpen && !opening && !offline ? (
              <div
                role="status"
                className="flex h-[58px] items-center justify-center gap-2.5 rounded-full bg-success/15 text-[15px] font-semibold text-success"
              >
                <Check className="size-[19px]" strokeWidth={2.5} />
                {doorOpen ? "Door is open" : "Door unlocked"}
              </div>
            ) : (
              <button
                type="button"
                disabled={blocked || opening}
                onClick={press}
                className="flex h-[58px] items-center justify-center gap-2.5 rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {opening ? (
                  <LoaderCircle className="size-[19px] animate-spin" />
                ) : door.pinRequired ? (
                  <KeyRound className="size-[19px]" strokeWidth={1.8} />
                ) : (
                  <LockOpen className="size-[19px]" strokeWidth={1.8} />
                )}
                {opening ? "Opening…" : "Unlock door"}
              </button>
            )}
            {failed && <p className="text-center text-xs text-destructive">{command?.message ?? "The door didn't respond."}</p>}
            {requestError && <p className="text-center text-xs text-destructive">{requestError}</p>}
            {loadError && <p className="text-center text-xs text-destructive">{loadError}</p>}
          </div>

          {/* Their own recent opens at this door */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold">Your recent opens</span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setView("log")}
                  className="flex items-center gap-1 text-[13px] text-muted-foreground"
                >
                  <LayoutGrid className="size-3.5" />
                  See all
                </button>
              )}
            </div>
            {recent.length === 0 ? (
              <p className="rounded-[20px] border border-border bg-card px-4 py-5 text-center text-sm text-muted-foreground">
                Nothing yet. Your opens at this door show up here.
              </p>
            ) : (
              recent.map((event) => (
                <div key={event.id} className="flex items-center gap-3 rounded-[20px] border border-border bg-card px-3.5 py-3">
                  <span className="flex size-[42px] flex-none items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-accent-foreground">
                    {initials(event.memberName ?? profile.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{event.memberName ?? profile.name}</div>
                    <div className="truncate text-xs text-muted-foreground">Opened via {METHOD_LABELS[event.method].toLowerCase()}</div>
                  </div>
                  <span className="flex-none rounded-full bg-secondary px-2.5 py-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
                    {formatClockTime(event.occurredAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

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
    </AppShell>
  );
}
