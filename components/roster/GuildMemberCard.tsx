"use client";

import { useState } from "react";

import type { GuildMember } from "@/lib/types";
import { ToolList } from "./ToolList";
import styles from "./GuildMemberCard.module.css";

type GuildMemberCardProps = {
  guildMember: GuildMember;
};

const statusClass: Record<GuildMember["status"], string> = {
  available: styles.statusAvailable,
  connected: styles.statusConnected,
  disconnected: styles.statusDisconnected,
  error: styles.statusError,
};

export function GuildMemberCard({ guildMember }: GuildMemberCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isPluginOnly = guildMember.memberType === "plugin";
  const toolCount = guildMember.tools.length;
  const toolLabel = toolCount === 1 ? "1 tool" : `${toolCount} tools`;

  const showToolBadge = !isPluginOnly && toolCount > 0;
  const showPluginBadge =
    guildMember.memberType === "plugin" || guildMember.memberType === "hybrid";

  const cardContent = (
    <>
      <span
        className={`${styles.statusDot} ${statusClass[guildMember.status]}`}
        title={guildMember.status}
      />
      <div className={styles.cardContent}>
        <div className={styles.nameRow}>
          <span className={styles.displayName}>
            {guildMember.displayName}
          </span>
          {showToolBadge && (
            <span className={styles.toolBadge}>{toolLabel}</span>
          )}
          {showPluginBadge && (
            <span className={styles.pluginBadge}>Plugin</span>
          )}
        </div>
        {guildMember.description && (
          <p className={styles.description}>{guildMember.description}</p>
        )}
        {guildMember.status === "error" && guildMember.error && (
          <p className={styles.errorMessage}>{guildMember.error}</p>
        )}
      </div>
    </>
  );

  if (isPluginOnly) {
    return (
      <div className={styles.card}>
        <div className={styles.staticHeader}>
          {cardContent}
        </div>
      </div>
    );
  }

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
        {cardContent}
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
