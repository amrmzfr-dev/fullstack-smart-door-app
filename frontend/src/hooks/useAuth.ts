import { useCallback, useEffect, useState } from "react";

import { HttpError, apiGetWithToken, apiPost } from "@/lib/api";
import { AUTH_CHANGED_EVENT, clearSession, getToken, getUsername, setSession } from "@/lib/auth";
import type { LoginResponse, MemberLoginResponse } from "@/types";

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [username, setUsername] = useState<string | null>(() => getUsername());

  useEffect(() => {
    const onAuthChanged = () => {
      setToken(getToken());
      setUsername(getUsername());
    };

    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    window.addEventListener("storage", onAuthChanged);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
      window.removeEventListener("storage", onAuthChanged);
    };
  }, []);

  const login = useCallback(async (usernameInput: string, password: string) => {
    try {
      const response = await apiPost<LoginResponse>("/auth/login", { username: usernameInput, password });
      setSession(response.token, response.username);
      return;
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401) throw error;
    }

    // Not the master login: try a member account that has admin access.
    const member = await apiPost<MemberLoginResponse>("/member/login", { username: usernameInput, password });
    try {
      const admin = await apiGetWithToken<{ token: string; username: string }>("/member/admin-token", member.token);
      setSession(admin.token, admin.username);
    } catch (error) {
      if (error instanceof HttpError && error.status === 403) {
        throw new HttpError("This account doesn't have admin access.", 401);
      }
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
  }, []);

  return { isAuthenticated: token !== null, username, login, logout };
}
