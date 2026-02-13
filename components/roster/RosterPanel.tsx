"use client";

import { useCallback, useEffect, useState } from "react";

import type { GuildMember, RosterResponse } from "@/lib/types";
import { GuildMemberCard } from "./GuildMemberCard";
import styles from "./RosterPanel.module.css";

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; members: GuildMember[] };

export function RosterPanel() {
  const [state, setState] = useState<FetchState>({ status: "loading" });

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

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Roster</span>
        {state.status === "loaded" && (
          <span className={styles.memberCount}>
            {state.members.length}
          </span>
        )}
      </div>

      <div className={styles.content}>
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
      </div>
    </div>
  );
}
