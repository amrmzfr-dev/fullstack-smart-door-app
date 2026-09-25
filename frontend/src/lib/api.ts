import { clearSession, getToken } from "@/lib/auth";

const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:5125/api";

export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// The backend returns errors either as a bare JSON string ("That PIN is
// already used...") or as ProblemDetails ({ title, ... }).
function readErrorMessage(body: string, fallback: string): string {
  if (!body) return fallback;
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "string") return parsed;
    if (parsed !== null && typeof parsed === "object" && "title" in parsed && typeof parsed.title === "string") {
      return parsed.title;
    }
  } catch {
    // Plain-text body — use as-is.
  }
  return body;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...authHeaders() };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 401 && getToken() !== null) {
      clearSession();
    }
    const text = await response.text();
    throw new HttpError(readErrorMessage(text, response.statusText), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

export function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  return request<T>("POST", path, body);
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>("PUT", path, body);
}

export function apiDelete<T = void>(path: string): Promise<T> {
  return request<T>("DELETE", path);
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpError && error.status !== 401 && error.status < 500) {
    return error.message;
  }
  return fallback;
}
