import { useState } from "react";
import { DoorClosed, LogOut, ScrollText, Users, Wifi, WifiOff, type LucideIcon } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useDoorStatus, useEvents } from "@/hooks/useDoorData";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { DoorTab } from "@/pages/DoorTab";
import { LogTab } from "@/pages/LogTab";
import { PeopleTab } from "@/pages/PeopleTab";

type Tab = "door" | "people" | "log";

const TABS: ReadonlyArray<{ key: Tab; label: string; icon: LucideIcon }> = [
  { key: "door", label: "Door", icon: DoorClosed },
  { key: "people", label: "People", icon: Users },
  { key: "log", label: "Log", icon: ScrollText },
];

interface DashboardPageProps {
  username: string | null;
  onLogout: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export function DashboardPage({ username, onLogout, theme, onToggleTheme }: DashboardPageProps) {
  const [tab, setTab] = useState<Tab>("door");
  const { status, error: statusError } = useDoorStatus();
  const { events, loading: eventsLoading } = useEvents();

  const online = status?.online ?? false;

  return (
    <div className="min-h-dvh bg-background pb-24 text-foreground sm:pb-10">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-primary text-primary-foreground">
              <DoorClosed className="size-5" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl leading-tight font-extrabold tracking-tight uppercase">Smart Door</h1>
              <p className="truncate font-mono text-xs text-muted-foreground">Admin · people and activity</p>
            </div>
          </div>

          <div className="flex flex-none items-center gap-2">
            <span
              className={cn(
                "hidden items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[.1em] uppercase sm:inline-flex",
                statusError
                  ? "bg-destructive/10 text-destructive"
                  : online
                    ? "bg-success/15 text-success"
                    : "bg-secondary text-muted-foreground",
              )}
            >
              {online && !statusError ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
              {statusError ? "Server unreachable" : online ? "Door online" : "Door offline"}
            </span>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <Button variant="outline" size="icon" onClick={onLogout} aria-label={`Sign out ${username ?? ""}`.trim()}>
              <LogOut />
            </Button>
          </div>
        </div>

        {/* Desktop tabs */}
        <nav className="mx-auto hidden max-w-6xl gap-1 px-4 sm:flex sm:px-6">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-3 pb-3 font-mono text-[11px] font-medium tracking-[.12em] uppercase transition-colors",
                tab === key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {statusError && (
          <p className="mb-6 rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive sm:hidden">
            {statusError}
          </p>
        )}
        {tab === "door" && (
          <DoorTab status={status} events={events} eventsLoading={eventsLoading} onViewLog={() => setTab("log")} />
        )}
        {tab === "people" && <PeopleTab doorOnline={online} />}
        {tab === "log" && <LogTab events={events} loading={eventsLoading} />}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] sm:hidden">
        <div className="grid grid-cols-3">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 font-mono text-[10px] tracking-[.12em] uppercase",
                tab === key ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
