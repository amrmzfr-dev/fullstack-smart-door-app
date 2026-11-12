import { useState } from "react";
import { DoorOpen, UserRound } from "lucide-react";

import { ADMIN_SECTIONS, AdminSections, type AdminSection } from "@/components/AdminSections";
import { AppShell, type NavItem } from "@/components/AppShell";
import { ProfileDialog } from "@/components/ProfileDialog";
import { ROUND_BUTTON_CLASS } from "@/components/ThemeToggle";
import type { Theme } from "@/lib/theme";
import { MyDoors } from "@/pages/AccountPage";

type Section = AdminSection | "mine";

const MINE_ITEM: NavItem<Section> = { key: "mine", label: "My doors", icon: DoorOpen };

interface DashboardPageProps {
  username: string | null;
  // True when the person also has their own doors to open (an admin with a person account).
  hasMyDoors: boolean;
  onLogout: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

// The signed-in page for admins: the admin pages, plus "My doors" to open their own doors.
export function DashboardPage({ username, hasMyDoors, onLogout, theme, onToggleTheme }: DashboardPageProps) {
  const [section, setSection] = useState<Section>(hasMyDoors ? "mine" : "overview");
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
      nav={{ items: hasMyDoors ? [MINE_ITEM, ...ADMIN_SECTIONS] : ADMIN_SECTIONS, active: section, onGo: setSection }}
    >
      {section === "mine" ? <MyDoors /> : <AdminSections section={section} onGo={setSection} />}
      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}
    </AppShell>
  );
}
