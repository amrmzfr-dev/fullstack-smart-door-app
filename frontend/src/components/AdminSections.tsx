import { DoorClosed, LayoutDashboard, ScrollText, Users, type LucideIcon } from "lucide-react";

import { useDoors, useEvents } from "@/hooks/useDoorData";
import { DoorsTab } from "@/pages/DoorsTab";
import { LogTab } from "@/pages/LogTab";
import { OverviewTab } from "@/pages/OverviewTab";
import { PeopleTab } from "@/pages/PeopleTab";

export type AdminSection = "overview" | "doors" | "people" | "log";

export const ADMIN_SECTIONS: ReadonlyArray<{ key: AdminSection; label: string; icon: LucideIcon }> = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "doors", label: "Doors", icon: DoorClosed },
  { key: "people", label: "People", icon: Users },
  { key: "log", label: "Log", icon: ScrollText },
];

interface AdminSectionsProps {
  section: AdminSection;
  onGo: (section: AdminSection) => void;
}

// The admin panel's pages, for the bar under Unlock on a person's phone.
// Mounted only while an admin page is open (it loads its data then).
export function AdminSections({ section, onGo }: AdminSectionsProps) {
  const { doors, loaded: doorsLoaded, error: statusError, refresh: refreshDoors } = useDoors();
  const { events, loading: eventsLoading } = useEvents();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5">
      {statusError && <p className="mb-4 rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">{statusError}</p>}
      {section === "overview" && <OverviewTab doors={doors} events={events} eventsLoading={eventsLoading} onGo={onGo} />}
      {section === "doors" && (
        <DoorsTab
          doors={doors}
          loaded={doorsLoaded}
          events={events}
          eventsLoading={eventsLoading}
          onViewLog={() => onGo("log")}
          onDoorsChanged={() => void refreshDoors()}
        />
      )}
      {section === "people" && <PeopleTab doors={doors} />}
      {section === "log" && <LogTab events={events} doors={doors} loading={eventsLoading} />}
    </div>
  );
}
