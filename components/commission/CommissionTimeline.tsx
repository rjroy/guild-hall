"use client";

import GemIndicator from "@/components/ui/GemIndicator";
import { statusToGem } from "@/lib/types";
import type { TimelineEntry } from "@/lib/commissions";
import styles from "./CommissionTimeline.module.css";

interface CommissionTimelineProps {
  timeline: TimelineEntry[];
}

/**
 * Chronological list of commission activity events. Each entry is rendered
 * with event-type-specific styling: status transitions show from/to gems,
 * progress reports show summary text, questions have visual distinction,
 * and results show a summary.
 *
 * The parent CommissionView manages live SSE updates and passes the
 * accumulated timeline as props. This component is purely presentational.
 */
export default function CommissionTimeline({
  timeline,
}: CommissionTimelineProps) {
  if (timeline.length === 0) {
    return (
      <div className={styles.container}>
        <h3 className={styles.label}>Activity</h3>
        <p className={styles.empty}>No activity yet.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.label}>Activity</h3>
      <ul className={styles.list}>
        {timeline.map((entry, index) => (
          <li key={`${entry.timestamp}-${index}`} className={styles.item}>
            <TimelineEntryRow entry={entry} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Safely extracts a string from a TimelineEntry's dynamic fields.
 * The index signature produces `unknown`, so we need explicit type checks.
 */
function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function TimelineEntryRow({ entry }: { entry: TimelineEntry }) {
  const time = formatTimestamp(entry.timestamp);

  switch (entry.event) {
    case "status_change":
      return (
        <div className={styles.statusChange}>
          <span className={styles.time}>{time}</span>
          <span className={styles.eventContent}>
            {typeof entry.from === "string" && (
              <>
                <GemIndicator
                  status={statusToGem(entry.from)}
                  size="sm"
                />
                <span className={styles.statusText}>
                  {entry.from.replace(/_/g, " ")}
                </span>
              </>
            )}
            <span className={styles.arrow} aria-hidden="true">
              &rarr;
            </span>
            {typeof entry.to === "string" && (
              <>
                <GemIndicator
                  status={statusToGem(entry.to)}
                  size="sm"
                />
                <span className={styles.statusText}>
                  {entry.to.replace(/_/g, " ")}
                </span>
              </>
            )}
          </span>
          {entry.reason && (
            <span className={styles.reason}>{String(entry.reason)}</span>
          )}
        </div>
      );

    case "progress_report":
      return (
        <div className={styles.progress}>
          <span className={styles.time}>{time}</span>
          <span className={styles.progressIcon} aria-hidden="true">
            &#9654;
          </span>
          <span className={styles.eventContent}>
            {str(entry.reason) || str(entry.summary)}
          </span>
        </div>
      );

    case "question":
      return (
        <div className={styles.question}>
          <span className={styles.time}>{time}</span>
          <span className={styles.questionIcon} aria-hidden="true">
            ?
          </span>
          <span className={styles.eventContent}>
            {str(entry.reason) || str(entry.question)}
          </span>
        </div>
      );

    case "result_submitted": {
      const detail = str(entry.reason) || str(entry.summary);
      return (
        <div className={styles.result}>
          <span className={styles.time}>{time}</span>
          <span className={styles.resultIcon} aria-hidden="true">
            &#10003;
          </span>
          <span className={styles.eventContent}>
            Result submitted{detail ? `: ${detail}` : ""}
          </span>
        </div>
      );
    }

    case "user_note":
      return (
        <div className={styles.note}>
          <span className={styles.time}>{time}</span>
          <span className={styles.noteIcon} aria-hidden="true">
            &#9998;
          </span>
          <span className={styles.eventContent}>
            {str(entry.reason) || str(entry.content)}
          </span>
        </div>
      );

    default:
      return (
        <div className={styles.generic}>
          <span className={styles.time}>{time}</span>
          <span className={styles.eventContent}>
            {entry.event}: {entry.reason}
          </span>
        </div>
      );
  }
}

function formatTimestamp(ts: string): string {
  if (!ts) return "";
  try {
    const date = new Date(ts);
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}
