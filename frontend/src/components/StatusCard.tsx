import type { LucideIcon } from "lucide-react";

import { SectionLabel } from "@/components/SectionLabel";
import { cn } from "@/lib/utils";

export type StatusTone = "good" | "warn" | "bad" | "unknown";

const DOT_CLASS: Record<StatusTone, string> = {
  good: "bg-success",
  warn: "bg-warning",
  bad: "bg-destructive",
  unknown: "bg-muted-foreground/40",
};

interface StatusCardProps {
  label: string;
  value: string;
  detail: string;
  tone: StatusTone;
  icon: LucideIcon;
}

export function StatusCard({ label, value, detail, tone, icon: Icon }: StatusCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-[18px] border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>{label}</SectionLabel>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("size-2.5 flex-none rounded-full", DOT_CLASS[tone])} />
        <span className="text-base font-extrabold tracking-tight uppercase">{value}</span>
      </div>
      <span className="truncate text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}
