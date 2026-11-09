import { cn } from "@/lib/utils";

export type StatusTone = "good" | "warn" | "bad" | "unknown";

const DOT_CLASS: Record<StatusTone, string> = {
  good: "bg-success",
  warn: "bg-primary",
  bad: "bg-destructive",
  unknown: "bg-muted-foreground/40",
};

const VALUE_CLASS: Record<StatusTone, string> = {
  good: "",
  warn: "text-primary dark:text-accent-foreground",
  bad: "text-destructive",
  unknown: "",
};

interface StatusCardProps {
  label: string;
  value: string;
  detail: string;
  tone: StatusTone;
}

// One cell of a door's status grid (cells share thin lines, see DoorCard).
export function StatusCard({ label, value, detail, tone }: StatusCardProps) {
  return (
    <div className="min-w-0 bg-card px-4 py-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 flex items-center gap-1.5 text-sm font-semibold", VALUE_CLASS[tone])}>
        <span className={cn("size-[7px] flex-none rounded-full", DOT_CLASS[tone])} />
        {value}
      </div>
      <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">{detail}</div>
    </div>
  );
}
