import { apiGet, apiPut } from "@/lib/api";
import type { Me } from "@/types";

export function fetchMe(): Promise<Me> {
  return apiGet<Me>("/auth/me");
}

export function changePassword(currentPassword: string, newPassword: string): Promise<Me> {
  return apiPut<Me>("/auth/password", { currentPassword, newPassword });
}
