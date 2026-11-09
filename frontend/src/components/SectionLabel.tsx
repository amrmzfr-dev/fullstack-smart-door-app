import type { ReactNode } from "react";

// Small mono uppercase label (tile captions, day headers).
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10.5px] font-medium tracking-[.1em] text-muted-foreground uppercase">
      {children}
    </span>
  );
}

// Top of every page: blue mono eyebrow, big title, optional action on the right.
export function SectionHeading({ label, title, children }: { label: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="font-mono text-[11px] tracking-[.14em] text-primary uppercase dark:text-accent-foreground">
          {label}
        </div>
        <h2 className="mt-1 text-2xl leading-tight font-semibold tracking-[-.02em]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// Heading inside a card.
export function PanelHeading({ label, title, children }: { label?: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {label && <div className="text-xs font-medium text-muted-foreground">{label}</div>}
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}
