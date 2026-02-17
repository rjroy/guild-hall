"use client";

import { useCallback, useEffect, useState } from "react";

import type { GuildMember, RosterResponse } from "@/lib/types";
import { GuildMemberCard } from "./GuildMemberCard";
import styles from "./RosterPanel.module.css";

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; members: GuildMember[] };

const MOBILE_BREAKPOINT = 767;

function isMobileWidth() {
  return typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT;
}

export function RosterPanel() {
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [collapsed, setCollapsed] = useState(false);

  // Collapse by default on mobile after first render
  useEffect(() => {
    if (isMobileWidth()) {
      setCollapsed(true);
    }
  }, []);

  const fetchRoster = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/roster");
      if (!response.ok) {
        throw new Error(`Failed to fetch roster (${response.status})`);
      }
      const members = (await response.json()) as RosterResponse;
      setState({ status: "loaded", members });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  useEffect(() => {
    void fetchRoster();
  }, [fetchRoster]);

  const memberCount = state.status === "loaded" ? state.members.length : 0;
  const isCollapsible = state.status === "loaded" && memberCount > 1;

  return (
    <div className={`${styles.panel} ${collapsed && isCollapsible ? styles.panelCollapsed : ""}`}>
      <div
        className={`${styles.header} ${isCollapsible ? styles.headerClickable : ""}`}
        onClick={isCollapsible ? () => setCollapsed(!collapsed) : undefined}
        role={isCollapsible ? "button" : undefined}
        tabIndex={isCollapsible ? 0 : undefined}
        aria-expanded={isCollapsible ? !collapsed : undefined}
        onKeyDown={
          isCollapsible
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setCollapsed(!collapsed);
                }
              }
            : undefined
        }
      >
        <div className={styles.headerLeft}>
          {isCollapsible && (
            <span
              className={collapsed ? styles.collapseIcon : styles.collapseIconOpen}
              aria-hidden="true"
            >
              &#9654;
            </span>
          )}
          <span className={styles.title}>Roster</span>
        </div>
        {state.status === "loaded" && (
          <span className={styles.memberCount}>
            {memberCount}
          </span>
        )}
      </div>

      {!(collapsed && isCollapsible) && <div className={styles.content}>
        {state.status === "loading" && (
          <div className={styles.loadingContainer}>
            <span className={styles.loadingText}>
              Loading roster
              <span className={styles.loadingDot}>...</span>
            </span>
          </div>
        )}

        {state.status === "error" && (
          <div className={styles.errorContainer}>
            <p className={styles.errorTitle}>Failed to load roster</p>
            <p className={styles.errorMessage}>{state.message}</p>
            <button className={styles.retryButton} onClick={() => void fetchRoster()}>
              Retry
            </button>
          </div>
        )}

        {state.status === "loaded" && state.members.length === 0 && (
          <p className={styles.emptyMessage}>
            No guild members found. Add members to the guild-members/ directory.
          </p>
        )}

        {state.status === "loaded" && state.members.length > 0 && (
          <div className={styles.memberList}>
            {state.members.map((member) => (
              <GuildMemberCard key={member.name} guildMember={member} />
            ))}
          </div>
        )}
      </div>}
    </div>
  );
}
