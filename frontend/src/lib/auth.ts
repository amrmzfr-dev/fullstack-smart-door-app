const STORAGE_KEY = "smart-door-token";
const USERNAME_KEY = "smart-door-username";

// Fired when the stored token changes (login, logout, or a 401 from the API)
// so mounted UI can react without prop-drilling auth state everywhere.
export const AUTH_CHANGED_EVENT = "smart-door-auth-changed";

export function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setSession(token: string, username: string): void {
  localStorage.setItem(STORAGE_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(USERNAME_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}
