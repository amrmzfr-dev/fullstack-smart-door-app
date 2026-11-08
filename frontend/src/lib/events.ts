import type { AccessEvent, AccessEventType, AccessMethod } from "@/types";

export type EventTone = "success" | "danger" | "muted";
export type EventCategory = "access" | "alarm" | "door" | "account";

// Plain names for "how did they get in" (filters, tables, exports).
export const METHOD_LABELS: Record<AccessMethod, string> = {
  none: "Unknown",
  keypad: "Door keypad",
  fingerprint: "Door fingerprint",
  exit_button: "Exit button",
  remote: "Web app",
  app_pin: "Keypad app (PIN)",
  phone_fingerprint: "Phone fingerprint",
  account: "Their account",
};

export const TYPE_LABELS: Record<AccessEventType, string> = {
  granted: "Opened",
  denied: "Denied",
  forced_open: "Forced open",
  left_open: "Left open",
  door_opened: "Door opened",
  door_closed: "Door closed",
  sign_in: "Signed in",
  sign_in_failed: "Failed sign-in",
};

export interface EventDescription {
  title: string;
  detail: string;
  badge: string;
  tone: EventTone;
  category: EventCategory;
}

const ALARM_TYPES: ReadonlyArray<AccessEventType> = ["forced_open", "left_open"];

export function isAlarm(event: AccessEvent): boolean {
  return ALARM_TYPES.includes(event.type);
}

// Turns a raw log entry into plain words for the activity list.
export function describeEvent(event: AccessEvent): EventDescription {
  switch (event.type) {
    case "granted":
      return { ...describeGranted(event), badge: "Opened", tone: "success", category: "access" };
    case "denied":
      return { ...describeDenied(event), badge: "Denied", tone: "danger", category: "access" };
    case "forced_open":
      return {
        title: "Door forced open",
        detail: "Opened without being unlocked",
        badge: "Alarm",
        tone: "danger",
        category: "alarm",
      };
    case "left_open":
      return {
        title: "Door left open",
        detail: "Still open 30 seconds after opening",
        badge: "Alarm",
        tone: "danger",
        category: "alarm",
      };
    case "door_opened":
      return { title: "Door opened", detail: "Door contact", badge: "Door", tone: "muted", category: "door" };
    case "door_closed":
      return { title: "Door closed", detail: "Door contact", badge: "Door", tone: "muted", category: "door" };
    case "sign_in":
      return {
        title: event.memberName ?? event.username ?? "Someone",
        detail: "Signed in to their account",
        badge: "Sign-in",
        tone: "muted",
        category: "account",
      };
    case "sign_in_failed":
      return {
        title: event.memberName ?? event.username ?? "Unknown username",
        detail: "Failed sign-in — wrong username or password",
        badge: "Failed",
        tone: "danger",
        category: "account",
      };
  }
}

function describeGranted(event: AccessEvent): Pick<EventDescription, "title" | "detail"> {
  switch (event.method) {
    case "keypad":
      // The door PIN belongs to nobody (and before the first sync it's the
      // built-in default PIN).
      return { title: "Door PIN", detail: "Opened with PIN on the door" };
    case "fingerprint":
      return {
        title: event.memberName ?? `Fingerprint #${event.fingerprintSlot ?? "?"}`,
        detail: "Opened with fingerprint",
      };
    case "exit_button":
      return { title: "Exit button", detail: "Opened from inside" };
    case "remote":
      return { title: event.memberName ?? event.username ?? "Web app", detail: "Remote unlock from the web app" };
    case "app_pin":
      return { title: "Door PIN", detail: "Opened with PIN on the app" };
    case "phone_fingerprint":
      return { title: event.memberName ?? "Someone", detail: "Opened with phone fingerprint" };
    case "account":
      return { title: event.memberName ?? "Someone", detail: "Opened from their account" };
    case "none":
      return { title: "Door unlocked", detail: "" };
  }
}

function describeDenied(event: AccessEvent): Pick<EventDescription, "title" | "detail"> {
  if (event.method === "keypad") {
    return { title: "Wrong PIN", detail: "Keypad" };
  }
  if (event.method === "app_pin") {
    return { title: "Wrong PIN", detail: "App keypad" };
  }
  if (event.method === "account") {
    return { title: event.memberName ?? "Someone", detail: "Wrong PIN in their account" };
  }
  if (event.method === "fingerprint") {
    if (event.memberName) {
      return { title: event.memberName, detail: "Fingerprint blocked — person is disabled" };
    }
    if (event.fingerprintSlot !== null) {
      return { title: `Fingerprint #${event.fingerprintSlot}`, detail: "Not on the access list" };
    }
    return { title: "Unknown finger", detail: "Fingerprint not recognised" };
  }
  return { title: "Access denied", detail: "" };
}
