"use client";

import { useState } from "react";

import type { GuildMember } from "@/lib/types";
import { ToolList } from "./ToolList";
import styles from "./GuildMemberCard.module.css";

type GuildMemberCardProps = {
  guildMember: GuildMember;
};

const statusClass: Record<GuildMember["status"], string> = {
  connected: styles.statusConnected,
  disconnected: styles.statusDisconnected,
  error: styles.statusError,
};

export function GuildMemberCard({ guildMember }: GuildMemberCardProps) {
  const [expanded, setExpanded] = useState(false);

  const toolCount = guildMember.tools.length;
  const toolLabel = toolCount === 1 ? "1 tool" : `${toolCount} tools`;

  return (
    <div className={styles.card}>
      <div
        className={styles.cardHeader}
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <span
          className={`${styles.statusDot} ${statusClass[guildMember.status]}`}
          title={guildMember.status}
        />
        <div className={styles.cardContent}>
          <div className={styles.nameRow}>
            <span className={styles.displayName}>
              {guildMember.displayName}
            </span>
            {toolCount > 0 && (
              <span className={styles.toolBadge}>{toolLabel}</span>
            )}
          </div>
          {guildMember.description && (
            <p className={styles.description}>{guildMember.description}</p>
          )}
          {guildMember.status === "error" && guildMember.error && (
            <p className={styles.errorMessage}>{guildMember.error}</p>
          )}
        </div>
        <span
          className={expanded ? styles.expandIconOpen : styles.expandIcon}
          aria-hidden="true"
        >
          &#9654;
        </span>
      </div>
      {expanded && (
        <ToolList tools={guildMember.tools} guildMember={guildMember.name} />
      )}
    </div>
  );
}
