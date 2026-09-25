import type { ReactNode } from "react";

// Small dim uppercase eyebrow label that sits above every card headline
// (same role as in the Gate Sensor app).
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] font-medium tracking-[.14em] text-muted-foreground uppercase">
      {children}
    </span>
  );
}

export function SectionHeading({ label, title, children }: { label: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <SectionLabel>{label}</SectionLabel>
        <h2 className="text-sm font-bold tracking-tight uppercase">{title}</h2>
      </div>
      {children}
    </div>
  );
}
