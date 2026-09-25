import { useState, type FormEvent } from "react";
import { LoaderCircle, Plus } from "lucide-react";

import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { createMember } from "@/lib/door";
import type { Member } from "@/types";

interface AddMemberDialogProps {
  onClose: () => void;
  onCreated: (member: Member) => void;
}

export function AddMemberDialog({ onClose, onCreated }: AddMemberDialogProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onCreated(await createMember(name.trim()));
    } catch (err) {
      setError(errorMessage(err, "Couldn't add this person. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add a person" subtitle="Then register their fingerprint on the door" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] font-medium tracking-[.14em] text-muted-foreground uppercase">
            Name
          </span>
          <Input
            autoFocus
            required
            maxLength={64}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Aisyah"
            className="h-11 rounded-[14px] px-3.5"
          />
        </label>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          type="submit"
          className="h-11 w-full rounded-[14px] text-sm font-extrabold uppercase"
          disabled={saving || name.trim().length === 0}
        >
          {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
          Add person
        </Button>
      </form>
    </Modal>
  );
}
