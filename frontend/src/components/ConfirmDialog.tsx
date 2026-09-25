import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { useHoldToConfirm } from "@/hooks/useHoldToConfirm";

// How long the "Hold to confirm" button must be held before it fires.
const HOLD_CONFIRM_MS = 1500;

interface ConfirmDialogProps {
  title: string;
  detail: string;
  busy: boolean;
  onCancel: () => void;
  onConfirmed: () => void;
}

export function ConfirmDialog({ title, detail, busy, onCancel, onConfirmed }: ConfirmDialogProps) {
  const { progress, start, cancel } = useHoldToConfirm(HOLD_CONFIRM_MS, onConfirmed);

  return (
    <Modal title={title} subtitle={detail} onClose={onCancel}>
      <div className="space-y-2">
        <button
          type="button"
          disabled={busy}
          onPointerDown={start}
          onPointerUp={cancel}
          onPointerLeave={cancel}
          onPointerCancel={cancel}
          onContextMenu={(event) => event.preventDefault()}
          className="relative h-11 w-full touch-none overflow-hidden rounded-[14px] bg-destructive/15 text-sm font-semibold text-destructive select-none"
        >
          <span
            className="absolute inset-0 origin-left bg-destructive"
            style={{ transform: `scaleX(${progress})`, transition: progress === 0 ? "transform .15s" : "none" }}
          />
          <span className={progress > 0.5 ? "relative text-primary-foreground" : "relative"}>
            {busy ? "Deleting…" : "Hold to confirm"}
          </span>
        </button>
        <Button variant="outline" className="h-10 w-full rounded-[12px]" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
