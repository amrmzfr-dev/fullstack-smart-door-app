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
        "flex h-[26px] w-11 flex-none items-center rounded-full p-[3px] transition-colors disabled:opacity-50",
        checked ? "justify-end bg-primary" : "justify-start bg-input",
      )}
    >
      <span className="size-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.2)]" />
    </button>
  );
}
