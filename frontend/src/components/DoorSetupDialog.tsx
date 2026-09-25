import { useState } from "react";
import { Copy, TriangleAlert } from "lucide-react";

import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import type { DoorSetup } from "@/types";

interface DoorSetupDialogProps {
  setup: DoorSetup;
  onClose: () => void;
}

// The lines for this door's firmware/door-controller/include/secrets.h. The
// key isn't stored anywhere, so this is the only time it can be seen.
export function DoorSetupDialog({ setup, onClose }: DoorSetupDialogProps) {
  const [copied, setCopied] = useState(false);

  const lines = [
    `#define DOOR_ID "${setup.door.id}"`,
    `#define DEVICE_API_KEY "${setup.deviceKey}"`,
    setup.mqttHost ? `#define MQTT_HOST "${setup.mqttHost}"` : null,
    setup.mqttPort ? `#define MQTT_PORT ${setup.mqttPort}` : null,
    setup.mqttPassword ? `#define MQTT_PASSWORD "${setup.mqttPassword}"` : null,
  ].filter((line): line is string => line !== null);
  const snippet = lines.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Select the text by hand instead.
    }
  };

  return (
    <Modal title={`Set up ${setup.door.name}'s controller`} subtitle="Put these in its secrets.h, then flash it" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-[12px] bg-warning/15 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 flex-none text-warning" />
          <p>
            Copy these now — the key is shown <strong>only once</strong>. Lost it? Use “Set up controller” again for a
            new key (and re-flash).
          </p>
        </div>

        <pre className="overflow-x-auto rounded-[12px] bg-secondary p-3 font-mono text-[11px] leading-5 select-all">
          {snippet}
        </pre>

        <ol className="space-y-1 text-sm text-muted-foreground">
          <li>1. In <span className="font-mono text-xs">firmware/door-controller/include/secrets.h</span>, set these lines.</li>
          <li>2. Also set that door&apos;s WiFi, and the same API_BASE_URL as the other doors.</li>
          <li>3. Flash its ESP32. It shows up here as online within a few seconds.</li>
        </ol>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => void copy()}>
            <Copy />
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button className="flex-1" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
