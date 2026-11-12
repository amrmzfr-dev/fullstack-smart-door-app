import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/App";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import "@/index.css";

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
