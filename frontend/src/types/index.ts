// Enum strings match the backend's snake_case JSON enums.

export type AccessEventType =
  | "granted"
  | "denied"
  | "forced_open"
  | "left_open"
  | "door_opened"
  | "door_closed";

export type AccessMethod =
  | "none"
  | "keypad"
  | "fingerprint"
  | "exit_button"
  | "remote"
  | "app_pin"
  | "phone_fingerprint";

export type CommandType = "unlock" | "enroll_fingerprint" | "delete_fingerprint";

export type CommandStatus =
  | "pending"
  | "sent"
  | "in_progress"
  | "succeeded"
  | "failed"
  | "expired"
  | "cancelled";

// Reported by the firmware while enrolling (see enrollSetStep in main.cpp).
export type EnrollStep = "place_finger" | "remove_finger" | "place_again" | "saving";

export interface LoginResponse {
  token: string;
  username: string;
}

export interface DoorStatus {
  online: boolean;
  lastSeenAt: string | null;
  doorOpen: boolean | null;
  locked: boolean | null;
  fingerprintReady: boolean | null;
  templateCount: number | null;
  firmwareVersion: string | null;
  ipAddress: string | null;
  rssi: number | null;
}

export interface Fingerprint {
  id: string;
  slot: number;
  label: string;
  enrolledAt: string;
}

export interface PhoneKey {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface Member {
  id: string;
  name: string;
  enabled: boolean;
  fingerprints: Fingerprint[];
  phones: PhoneKey[];
  createdAt: string;
}

// The one door PIN everyone uses. Never the PIN itself.
export interface DoorPinStatus {
  isSet: boolean;
  updatedAt: string | null;
}

export interface DeviceCommand {
  id: string;
  type: CommandType;
  status: CommandStatus;
  slot: number | null;
  step: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccessEvent {
  id: string;
  type: AccessEventType;
  method: AccessMethod;
  memberId: string | null;
  memberName: string | null;
  username: string | null;
  fingerprintSlot: number | null;
  occurredAt: string;
}

// ---- Public keypad app ----

// doorOpen / locked are null while the door is offline.
export interface UnlockStatus {
  online: boolean;
  doorOpen: boolean | null;
  locked: boolean | null;
}

// Deliberately no name: the keypad app never says who opened the door.
export interface UnlockProgress {
  id: string;
  status: CommandStatus;
  message: string | null;
}

// `options` is WebAuthn JSON (binary fields base64url) — see lib/webauthn.ts.
export interface WebAuthnChallenge<TOptions> {
  flowId: string;
  options: TOptions;
}

export interface PhoneSetupResult {
  id: string;
  label: string;
}

// ---- Phone fingerprint setup (one-time link) ----

export interface PhoneInvite {
  token: string;
  expiresAt: string;
}

// What the phone shows before scanning.
export interface PhoneInviteInfo {
  memberName: string;
  expiresAt: string;
}
