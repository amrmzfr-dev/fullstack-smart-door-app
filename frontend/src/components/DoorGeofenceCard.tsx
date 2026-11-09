import { useEffect, useState } from "react";
import { ExternalLink, LoaderCircle, LocateFixed, MapPin } from "lucide-react";

import { Switch } from "@/components/Switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { setDoorGeofence } from "@/lib/door";
import { getPhoneLocation } from "@/lib/location";
import type { Door, DoorGeofence } from "@/types";

const MIN_RADIUS = 20;
const MAX_RADIUS = 2000;

interface DoorGeofenceCardProps {
  door: Door;
  onChanged: () => void;
  onNotice: (tone: "success" | "error", text: string) => void;
}

function same(a: DoorGeofence, b: DoorGeofence): boolean {
  return (
    a.enabled === b.enabled &&
    a.latitude === b.latitude &&
    a.longitude === b.longitude &&
    a.radiusMeters === b.radiusMeters
  );
}

// "Only near the door": when on, a signed-in person can unlock this door from
// their phone only while the phone is inside a circle around the door. Set the
// centre by standing at the door and pressing "Use my location".
export function DoorGeofenceCard({ door, onChanged, onNotice }: DoorGeofenceCardProps) {
  const saved = door.geofence;
  const [draft, setDraft] = useState<DoorGeofence>(saved);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const hasCentre = draft.latitude !== null && draft.longitude !== null;
  const radiusOk = draft.radiusMeters >= MIN_RADIUS && draft.radiusMeters <= MAX_RADIUS;
  const dirty = !same(draft, saved);
  const canSave = dirty && radiusOk && (!draft.enabled || hasCentre);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const here = await getPhoneLocation();
      setDraft((current) => ({
        ...current,
        latitude: Number(here.latitude.toFixed(6)),
        longitude: Number(here.longitude.toFixed(6)),
      }));
      onNotice(
        "success",
        `Location found (about ${Math.round(here.accuracyMeters)} m accurate). Press Save to keep it.`,
      );
    } catch (err) {
      onNotice("error", errorMessage(err, "Couldn't get the location."));
    } finally {
      setLocating(false);
    }
  };

  const save = async (next: DoorGeofence) => {
    setBusy(true);
    try {
      await setDoorGeofence(door.id, next);
      onNotice(
        "success",
        next.enabled
          ? `${door.name}: people must be within ${next.radiusMeters} m to unlock`
          : `${door.name}: unlock works from anywhere again`,
      );
    } catch (err) {
      onNotice("error", errorMessage(err, "Couldn't save. Try again."));
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const mapsUrl = hasCentre ? `https://www.google.com/maps?q=${draft.latitude},${draft.longitude}` : null;

  return (
    <div className="border-b border-border px-4 py-3.5">
      <div className="flex items-start gap-3">
        <MapPin className="mt-px size-[18px] flex-none text-muted-foreground" strokeWidth={1.8} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Geofence</p>
          <p className="mt-0.5 text-xs leading-[1.45] text-muted-foreground">
            {saved.enabled
              ? `On — phones must be within ${saved.radiusMeters} m of the door.`
              : "Off — phones can unlock from anywhere."}
          </p>
        </div>
        <Switch
          checked={draft.enabled}
          disabled={busy || (!draft.enabled && !hasCentre)}
          label={`Only allow unlocking ${door.name} near the door`}
          onChange={(enabled) => {
            const next = { ...draft, enabled };
            setDraft(next);
            // Switching off, or on with a saved centre, applies straight away.
            if (!dirty || !enabled) void save(next);
          }}
        />
      </div>

      <div className="mt-3.5 space-y-3 rounded-xl bg-soft p-3.5">
      {!hasCentre && (
        <p className="text-xs text-muted-foreground">
          Stand at the door with your phone, press "Use my location", then Save. After that you can switch this on.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Latitude</span>
          <Input
            inputMode="decimal"
            className="h-10 w-36 rounded-[9px] font-mono"
            value={draft.latitude ?? ""}
            onChange={(event) => {
              const value = event.target.value.trim();
              setDraft({ ...draft, latitude: value === "" || Number.isNaN(Number(value)) ? null : Number(value) });
            }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Longitude</span>
          <Input
            inputMode="decimal"
            className="h-10 w-36 rounded-[9px] font-mono"
            value={draft.longitude ?? ""}
            onChange={(event) => {
              const value = event.target.value.trim();
              setDraft({ ...draft, longitude: value === "" || Number.isNaN(Number(value)) ? null : Number(value) });
            }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Distance (m)</span>
          <Input
            type="number"
            min={MIN_RADIUS}
            max={MAX_RADIUS}
            className="h-10 w-28 rounded-[9px] font-mono"
            value={draft.radiusMeters}
            onChange={(event) => setDraft({ ...draft, radiusMeters: Math.round(Number(event.target.value)) })}
          />
        </label>
      </div>

      {!radiusOk && (
        <p className="text-xs text-destructive">
          Distance must be between {MIN_RADIUS} and {MAX_RADIUS} metres.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={busy || locating} onClick={() => void useMyLocation()}>
          {locating ? <LoaderCircle className="animate-spin" /> : <LocateFixed />}
          Use my location
        </Button>
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
            View on map
          </a>
        )}
        <Button className="ml-auto" size="sm" disabled={busy || !canSave} onClick={() => void save(draft)}>
          {busy && <LoaderCircle className="animate-spin" />}
          Save
        </Button>
      </div>
      </div>
    </div>
  );
}
