const TOKEN_KEY = "smart-door-member-token";
const NAME_KEY = "smart-door-member-name";

// Fired when the stored token changes (sign in, sign out, or a 401).
export const MEMBER_AUTH_CHANGED_EVENT = "smart-door-member-auth-changed";

export function getMemberToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getMemberName(): string | null {
  return localStorage.getItem(NAME_KEY);
}

export function setMemberSession(token: string, name: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(NAME_KEY, name);
  window.dispatchEvent(new Event(MEMBER_AUTH_CHANGED_EVENT));
}

export function clearMemberSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAME_KEY);
  window.dispatchEvent(new Event(MEMBER_AUTH_CHANGED_EVENT));
}
