import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";

import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";

interface DoorNameDialogProps {
  title: string;
  subtitle: string;
  submitLabel: string;
  initialName?: string;
  onClose: () => void;
  // Throws to show an error; resolves when saved.
  onSubmit: (name: string) => Promise<void>;
}

// Name a new door, or rename one.
export function DoorNameDialog({ title, subtitle, submitLabel, initialName = "", onClose, onSubmit }: DoorNameDialogProps) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(name.trim());
    } catch (err) {
      setError(errorMessage(err, "Couldn't save. Try again."));
      setSaving(false);
    }
  };

  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] font-medium tracking-[.14em] text-muted-foreground uppercase">
            Door name
          </span>
          <Input
            autoFocus
            required
            maxLength={64}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Store Room"
            className="h-11 rounded-[14px] px-3.5"
          />
        </label>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          type="submit"
          className="h-11 w-full rounded-[14px] text-sm font-extrabold uppercase"
          disabled={saving || name.trim().length === 0}
        >
          {saving && <LoaderCircle className="animate-spin" />}
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}
