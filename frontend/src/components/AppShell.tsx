import type { ReactNode } from "react";
import { DoorClosed, LogOut, type LucideIcon } from "lucide-react";

import { ROUND_BUTTON_CLASS, ThemeToggle } from "@/components/ThemeToggle";
import { initials } from "@/lib/format";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export interface NavItem<Key extends string> {
  key: Key;
  label: string;
  icon: LucideIcon;
}

function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

interface AppShellProps<Key extends string> {
  // Who is signed in: shown as "Hello, <first name>" next to their initials.
  name: string;
  theme: Theme;
  onToggleTheme: () => void;
  onLogout: () => void;
  // Extra round buttons between the theme and sign-out buttons.
  actions?: ReactNode;
  // Bottom pill. Left out for people who only have the Unlock page.
  nav?: { items: ReadonlyArray<NavItem<Key>>; active: Key; onGo: (key: Key) => void };
  children: ReactNode;
}

// The phone-sized frame every signed-in page lives in: header with the
// person's initials, a scrolling middle, and the floating dark pill menu.
export function AppShell<Key extends string>({
  name,
  theme,
  onToggleTheme,
  onLogout,
  actions,
  nav,
  children,
}: AppShellProps<Key>) {
  const firstName = name.trim().split(/\s+/)[0] || name;

  return (
    <div className="min-h-dvh bg-page">
      {/* Phone and tablet: one 440px column. Laptop and up (lg): full-width web layout with a side menu. */}
      <div className="relative mx-auto flex h-dvh w-full max-w-[440px] overflow-hidden bg-background text-foreground sm:shadow-[0_20px_60px_rgba(15,40,80,.12)] lg:max-w-none lg:shadow-none">
        {nav && (
          <aside className="hidden w-64 flex-none flex-col gap-1 bg-nav p-5 lg:flex">
            <div className="mb-6 flex items-center gap-3 px-2 pt-1">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <DoorClosed className="size-5" strokeWidth={1.8} />
              </div>
              <span className="text-[17px] font-semibold text-white">Smart Door</span>
            </div>
            {nav.items.map(({ key, label, icon: Icon }) => {
              const on = key === nav.active;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => nav.onGo(key)}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-full px-4 text-sm font-medium transition-colors",
                    on ? "bg-primary text-primary-foreground" : "text-nav-foreground hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.8} />
                  {label}
                </button>
              );
            })}
          </aside>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-none items-center gap-3 px-[18px] pt-[max(18px,env(safe-area-inset-top))] pb-3 lg:px-10 lg:pt-6 lg:pb-4">
            <div className="flex size-[46px] flex-none items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-primary-foreground">
              {initials(name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[17px] leading-tight font-semibold">Hello, {firstName}</div>
              <div className="truncate text-xs text-muted-foreground">{greeting(new Date())}</div>
            </div>
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            {actions}
            <button type="button" onClick={onLogout} aria-label="Sign out" className={ROUND_BUTTON_CLASS}>
              <LogOut className="size-[18px]" strokeWidth={1.8} />
            </button>
          </header>

          <main
            className={cn(
              "min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-[18px] pt-2 lg:px-10 lg:pb-12",
              nav ? "pb-32" : "pb-10",
            )}
          >
            <div className="mx-auto w-full lg:max-w-4xl">{children}</div>
          </main>
        </div>

        {nav && (
          <nav className="fixed bottom-[max(18px,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-white/10 bg-nav p-1.5 shadow-[0_14px_30px_rgba(10,14,20,.28)] lg:hidden">
            {nav.items.map(({ key, label, icon: Icon }) => {
              const on = key === nav.active;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => nav.onGo(key)}
                  aria-label={label}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex h-12 min-w-12 items-center justify-center gap-2 rounded-full transition-all duration-200",
                    on ? "bg-primary px-[18px] text-primary-foreground" : "text-nav-foreground hover:text-white",
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.8} />
                  {on && <span className="text-[13px] font-medium whitespace-nowrap">{label}</span>}
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
