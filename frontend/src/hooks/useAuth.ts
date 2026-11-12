import { useCallback, useEffect, useState } from "react";

import { HttpError, apiGetWithToken, apiPost } from "@/lib/api";
import { clearMemberSession, setMemberSession } from "@/lib/memberAuth";
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

  // One sign-in for everyone. The master login opens the admin pages. A person's
  // login opens their doors, and also the admin pages when they are an admin.
  const login = useCallback(async (usernameInput: string, password: string) => {
    try {
      const response = await apiPost<LoginResponse>("/auth/login", { username: usernameInput, password });
      clearMemberSession();
      setSession(response.token, response.username);
      return;
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401) throw error;
    }

    const member = await apiPost<MemberLoginResponse>("/member/login", { username: usernameInput, password });
    setMemberSession(member.token, member.name);
    try {
      const admin = await apiGetWithToken<{ token: string; username: string }>("/member/admin-token", member.token);
      setSession(admin.token, admin.username);
    } catch (error) {
      // 403 = not an admin: they just see their own doors.
      if (!(error instanceof HttpError) || error.status !== 403) throw error;
      clearSession();
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    clearMemberSession();
  }, []);

  return { isAuthenticated: token !== null, username, login, logout };
}
