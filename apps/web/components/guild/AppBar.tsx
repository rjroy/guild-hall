"use client";

import Link from "next/link";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import Icon from "./Icon";

interface AppBarProps {
  /** e.g. "guild-hall" or "all projects" */
  project?: string;
  /** e.g. "Dashboard" or "Project Hub" */
  page?: string;
}

const THEME_STORAGE_KEY = "guild:theme";
type Theme = "dark" | "light";

function readStoredTheme(): Theme {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" ? "light" : "dark";
}

/**
 * Subscribe to theme changes from other tabs (storage event) and from
 * within this tab (custom "guild:theme-change" event we dispatch on
 * toggle). useSyncExternalStore handles the SSR snapshot cleanly so we
 * don't need a setState-in-effect dance.
 */
function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener("guild:theme-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("guild:theme-change", callback);
  };
}

const getServerSnapshot = (): Theme => "dark";

export default function AppBar({ project, page }: AppBarProps) {
  const theme = useSyncExternalStore(subscribe, readStoredTheme, getServerSnapshot);

  // Apply the persisted theme to <html>. Layout sets data-theme="dark"
  // for SSR; this realigns once we've read localStorage on the client.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    window.dispatchEvent(new Event("guild:theme-change"));
  }, [theme]);

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 18px",
        borderBottom: "1px solid var(--rule)",
        background: "var(--bg-raised)",
        height: 56,
        flex: "0 0 auto",
        position: "relative",
        zIndex: 10,
      }}
    >
      <Link
        href="/"
        aria-label="Guild Hall"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          color: "inherit",
          textDecoration: "none",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            background:
              "linear-gradient(135deg, var(--brass-300), var(--brass-700))",
            borderRadius: 4,
            position: "relative",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.3), var(--shadow-sm)",
            display: "grid",
            placeItems: "center",
            flex: "0 0 auto",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ink-900)"
            strokeWidth="2"
          >
            <path d="M12 3 L20 6 V12 a8 8 0 0 1-8 8 a8 8 0 0 1-8-8 V6 z" />
            <path d="M7 8 L17 18 M17 8 L7 18" />
          </svg>
        </span>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            letterSpacing: "0.04em",
            color: "var(--fg-1)",
          }}
        >
          Guild Hall
        </span>
      </Link>

      {(project || page) && (
        <span
          style={{
            color: "var(--fg-3)",
            fontSize: 13,
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
          }}
        >
          {project && <>∙ {project}</>}
          {page && <> ∙ {page}</>}
        </span>
      )}

      <span style={{ flex: 1 }} />

      <button
        type="button"
        className="btn btn-quiet"
        aria-label="Search"
        title="Search"
      >
        <Icon name="search" size={18} />
      </button>
      <button
        type="button"
        className="btn btn-quiet"
        aria-label="Notifications"
        title="Notifications"
      >
        <Icon name="bell" size={18} />
      </button>
      <button
        type="button"
        className="btn btn-quiet"
        aria-label={`Switch to ${theme === "dark" ? "parchment (light)" : "night hall (dark)"} theme`}
        title={`Switch to ${theme === "dark" ? "parchment" : "night hall"} theme`}
        onClick={toggleTheme}
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
      </button>
    </header>
  );
}
