import { useCallback, useEffect, useState } from "react";

import { apiPost } from "@/lib/api";
import {
  MEMBER_AUTH_CHANGED_EVENT,
  clearMemberSession,
  getMemberName,
  getMemberToken,
  setMemberSession,
} from "@/lib/memberAuth";
import type { MemberLoginResponse } from "@/types";

export function useMemberAuth() {
  const [token, setToken] = useState<string | null>(() => getMemberToken());
  const [name, setName] = useState<string | null>(() => getMemberName());

  useEffect(() => {
    const onChanged = () => {
      setToken(getMemberToken());
      setName(getMemberName());
    };
    window.addEventListener(MEMBER_AUTH_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onChanged);
    return () => {
      window.removeEventListener(MEMBER_AUTH_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await apiPost<MemberLoginResponse>("/member/login", { username, password });
    setMemberSession(response.token, response.name);
  }, []);

  const logout = useCallback(() => {
    clearMemberSession();
  }, []);

  return { isAuthenticated: token !== null, name, login, logout };
}
