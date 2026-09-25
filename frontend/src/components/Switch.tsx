import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}

export function Switch({ checked, onChange, disabled, label }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 flex-none items-center rounded-full border transition-colors disabled:opacity-50",
        checked ? "border-transparent bg-primary" : "border-border bg-muted",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 rounded-full transition-transform",
          checked ? "translate-x-6 bg-primary-foreground" : "translate-x-1 bg-muted-foreground",
        )}
      />
    </button>
  );
}
