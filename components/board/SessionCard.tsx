"use client";

import Link from "next/link";

import type { SessionMetadata, SessionStatus } from "@/lib/types";
import { formatMessageLabel } from "@/lib/board-utils";
import { formatRelativeTime } from "@/lib/relative-time";
import styles from "./SessionCard.module.css";

type SessionCardProps = {
  session: SessionMetadata;
  onDelete?: (id: string) => void;
};

const statusDotClass: Record<SessionStatus, string> = {
  idle: styles.statusIdle,
  running: styles.statusRunning,
  completed: styles.statusCompleted,
  expired: styles.statusExpired,
  error: styles.statusError,
};

const statusLabel: Record<SessionStatus, string> = {
  idle: "idle",
  running: "running",
  completed: "done",
  expired: "expired",
  error: "error",
};

export function SessionCard({ session, onDelete }: SessionCardProps) {
  const messageLabel = formatMessageLabel(session.messageCount);

  return (
    <Link
      href={`/sessions/${session.id}`}
      className={styles.card}
    >
      <div className={styles.topRow}>
        <span
          className={`${styles.statusDot} ${statusDotClass[session.status]}`}
          title={session.status}
        />
        <span className={styles.sessionName}>{session.name}</span>
        <span className={styles.statusBadge}>{statusLabel[session.status]}</span>
        {onDelete && (
          <button
            className={styles.deleteButton}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(session.id);
            }}
            aria-label={`Delete session ${session.name}`}
            title="Delete session"
          >
            &#10005;
          </button>
        )}
      </div>

      {session.guildMembers.length > 0 && (
        <div className={styles.memberRow}>
          {session.guildMembers.map((member) => (
            <span key={member} className={styles.memberChip}>
              {member}
            </span>
          ))}
        </div>
      )}

      <div className={styles.metaRow}>
        <span>{messageLabel}</span>
        <span className={styles.metaSeparator}>|</span>
        <span>{formatRelativeTime(session.lastActivityAt)}</span>
      </div>
    </Link>
  );
}
