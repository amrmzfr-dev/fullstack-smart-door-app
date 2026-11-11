import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ShareButtonsProps {
  message: string;
  // "large" = tall pill buttons for dialogs, "small" = compact buttons for rows.
  size?: "large" | "small";
  className?: string;
}

// Copy a message to the clipboard, and (on phones) open the share sheet.
export function ShareButtons({ message, size = "large", className }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const large = size === "large";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: nothing to do.
    }
  };

  return (
    <div className={cn("flex gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size={large ? "default" : "sm"}
        className={cn(large && "h-[50px] flex-1 rounded-full text-[15px] font-semibold")}
        onClick={() => void copy()}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : large ? "Copy message" : "Copy"}
      </Button>
      {typeof navigator.share === "function" && (
        <Button
          type="button"
          variant="outline"
          size={large ? "default" : "sm"}
          className={cn(large && "h-[50px] flex-1 rounded-full text-[15px] font-semibold")}
          onClick={() => void navigator.share({ text: message }).catch(() => undefined)}
        >
          <Share2 />
          Share
        </Button>
      )}
    </div>
  );
}
