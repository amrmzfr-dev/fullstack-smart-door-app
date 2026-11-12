import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/App";
import { clearSession } from "@/lib/auth";
import { clearMemberSession } from "@/lib/memberAuth";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import "@/index.css";

// Bump this number to sign everyone out: each phone or browser signs out once,
// the next time it opens the app, and is asked to sign in again.
const SESSION_VERSION = "2";
try {
  if (localStorage.getItem("smart-door-session-version") !== SESSION_VERSION) {
    clearSession();
    clearMemberSession();
    localStorage.setItem("smart-door-session-version", SESSION_VERSION);
  }
} catch {
  // Storage blocked: nothing to clear.
}

// Before the first render, so the page doesn't flash the wrong theme.
applyTheme(getStoredTheme());

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Not installable on this browser; the page still works normally.
    });
  });
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
