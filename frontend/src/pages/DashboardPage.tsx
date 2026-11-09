import { useState } from "react";
import { UserRound } from "lucide-react";

import { ADMIN_SECTIONS, AdminSections, type AdminSection } from "@/components/AdminSections";
import { AppShell } from "@/components/AppShell";
import { ProfileDialog } from "@/components/ProfileDialog";
import { ROUND_BUTTON_CLASS } from "@/components/ThemeToggle";
import type { Theme } from "@/lib/theme";

interface DashboardPageProps {
  username: string | null;
  onLogout: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

// /admin — the management dashboard for the master admin login.
export function DashboardPage({ username, onLogout, theme, onToggleTheme }: DashboardPageProps) {
  const [section, setSection] = useState<AdminSection>("overview");
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <AppShell
      name={username ?? "Admin"}
      theme={theme}
      onToggleTheme={onToggleTheme}
      onLogout={onLogout}
      actions={
        <button
          type="button"
          onClick={() => setProfileOpen(true)}
          aria-label={`My profile${username ? ` (${username})` : ""}`}
          className={ROUND_BUTTON_CLASS}
        >
          <UserRound className="size-[18px]" strokeWidth={1.8} />
        </button>
      }
      nav={{ items: ADMIN_SECTIONS, active: section, onGo: setSection }}
    >
      <AdminSections section={section} onGo={setSection} />
      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}
    </AppShell>
  );
}
