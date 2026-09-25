import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/App";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import "@/index.css";

// Before the first render, so the page doesn't flash the wrong theme.
applyTheme(getStoredTheme());

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
