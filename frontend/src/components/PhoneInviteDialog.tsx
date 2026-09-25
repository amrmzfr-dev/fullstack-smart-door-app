import { useEffect, useState } from "react";
import { CircleCheck, Copy, LoaderCircle, Share2 } from "lucide-react";
import QRCode from "qrcode";

import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/useNow";
import { errorMessage } from "@/lib/api";
import { createPhoneInvite, fetchMembers } from "@/lib/door";
import type { Member } from "@/types";

const WATCH_MS = 3000;

interface Invite {
  url: string;
  qr: string;
  expiresAt: number;
}

interface PhoneInviteDialogProps {
  member: Member;
  onClose: () => void;
}

// Makes a one-time setup link for the person to open on their own phone, as
// a QR code to scan or a link to send. Watches for the phone to show up.
export function PhoneInviteDialog({ member, onClose }: PhoneInviteDialogProps) {
  const now = useNow(1000);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const create = async () => {
      try {
        const created = await createPhoneInvite(member.id);
        const url = `${window.location.origin}/setup/${created.token}`;
        const qr = await QRCode.toDataURL(url, { margin: 1, width: 480 });
        if (!cancelled) setInvite({ url, qr, expiresAt: new Date(created.expiresAt).getTime() });
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "Couldn't create a setup link. Try again."));
      }
    };
    void create();
    return () => {
      cancelled = true;
    };
  }, [member.id]);

  // Notice when the phone finishes, so the admin sees it worked.
  useEffect(() => {
    if (invite === null || added) return;
    const startCount = member.phones.length;
    const timer = window.setInterval(async () => {
      try {
        const members = await fetchMembers();
        const current = members.find((candidate) => candidate.id === member.id);
        if (current && current.phones.length > startCount) setAdded(true);
      } catch {
        // Keep watching.
      }
    }, WATCH_MS);
    return () => window.clearInterval(timer);
  }, [invite, added, member.id, member.phones.length]);

  const copy = async () => {
    if (invite === null) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — press and hold the link to copy it.");
    }
  };

  const share = async () => {
    if (invite === null) return;
    try {
      await navigator.share({ title: "Smart Door", text: `Set up fingerprint for ${member.name}`, url: invite.url });
    } catch {
      // Closed the share sheet — nothing to do.
    }
  };

  const secondsLeft = invite ? Math.max(0, Math.round((invite.expiresAt - now) / 1000)) : 0;
  const expired = invite !== null && secondsLeft === 0;

  return (
    <Modal
      title={`Set up ${member.name}'s phone`}
      subtitle="They scan this with their own phone"
      onClose={onClose}
    >
      <div className="space-y-4 text-center">
        {added ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex size-14 items-center justify-center rounded-full bg-success/15 text-success">
              <CircleCheck className="size-7" />
            </div>
            <p className="text-lg font-extrabold tracking-tight">Phone added</p>
            <p className="text-sm text-muted-foreground">
              {member.name} can now open the door with their phone's fingerprint.
            </p>
            <Button className="mt-2" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : invite === null ? (
          <p className="inline-flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Making a setup link…
          </p>
        ) : (
          <>
            {/* QR codes need dark-on-light to scan, in either theme. */}
            <div className="mx-auto w-fit rounded-[16px] bg-white p-3">
              <img
                src={invite.qr}
                alt={`Setup QR code for ${member.name}`}
                className={expired ? "size-52 opacity-20" : "size-52"}
              />
            </div>

            <ol className="mx-auto max-w-[300px] space-y-1 text-left text-sm text-muted-foreground">
              <li>1. {member.name} scans this with their phone's camera (or opens the link).</li>
              <li>2. They tap the fingerprint and touch their phone's reader.</li>
              <li>3. Done — this box shows "Phone added".</li>
            </ol>

            <div className="flex items-center gap-2 rounded-[12px] bg-secondary p-2 text-left">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{invite.url}</span>
              <Button variant="outline" size="sm" disabled={expired} onClick={() => void copy()}>
                <Copy />
                {copied ? "Copied" : "Copy"}
              </Button>
              {typeof navigator.share === "function" && (
                <Button variant="outline" size="sm" disabled={expired} onClick={() => void share()}>
                  <Share2 />
                  Share
                </Button>
              )}
            </div>

            <p className={expired ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {expired
                ? "This link has expired — close and make a new one."
                : `Works once · expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
