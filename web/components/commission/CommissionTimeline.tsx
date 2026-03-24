"use client";

import { useState } from "react";
import GemIndicator from "@/web/components/ui/GemIndicator";
import { statusToGem } from "@/lib/types";
import type { TimelineEntry } from "@/lib/commissions";
import styles from "./CommissionTimeline.module.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

export type TimelineTab = "all" | "worker" | "user" | "manager";

const TABS: { key: TimelineTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "worker", label: "Worker Notes" },
  { key: "user", label: "User Notes" },
  { key: "manager", label: "Manager Notes" },
];

export const WORKER_EVENTS = new Set(["progress_report", "result_submitted", "question"]);
export const USER_EVENTS = new Set(["user_note"]);
export const MANAGER_EVENTS = new Set(["manager_note", "manager_dispatched"]);

export function filterTimeline(timeline: TimelineEntry[], tab: TimelineTab): TimelineEntry[] {
  if (tab === "all") return timeline;
  if (tab === "worker") return timeline.filter((e) => WORKER_EVENTS.has(e.event));
  if (tab === "user") return timeline.filter((e) => USER_EVENTS.has(e.event));
  if (tab === "manager") return timeline.filter((e) => MANAGER_EVENTS.has(e.event));
  return timeline;
}

interface CommissionTimelineProps {
  timeline: TimelineEntry[];
}

/**
 * Chronological list of commission activity events with tab filtering.
 *
 * Each entry is rendered with event-type-specific styling: status transitions
 * show from/to gems, progress reports show summary text, questions have visual
 * distinction, results show a summary, and manager notes have a distinct accent.
 *
 * Tabs filter the same timeline data without separate fetching:
 * - All: every event (default)
 * - Worker Notes: progress_report, result_submitted, question
 * - User Notes: user_note
 * - Manager Notes: manager_note, manager_dispatched
 *
 * The parent CommissionView manages live SSE updates and passes the
 * accumulated timeline as props.
 */
export default function CommissionTimeline({
  timeline,
}: CommissionTimelineProps) {
  const [activeTab, setActiveTab] = useState<TimelineTab>("all");
  const filtered = filterTimeline(timeline, activeTab);

  return (
    <div className={styles.container}>
      <h3 className={styles.label}>Activity</h3>

      <div className={styles.tabBar} role="tablist" aria-label="Timeline filter">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {timeline.length === 0 ? (
        <p className={styles.empty}>No activity yet.</p>
      ) : filtered.length === 0 ? (
        <p className={styles.empty}>No matching entries.</p>
      ) : (
        <ul className={styles.list}>
          {filtered.map((entry, index) => (
            <li key={`${entry.timestamp}-${index}`} className={styles.item}>
              <TimelineEntryRow entry={entry} />
            </li>
          ))}
        </ul>
      )}
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
          {detail ? (
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
              {`## Result submitted\n\n${detail}`}
            </ReactMarkdown>
          ) : (
            <p>No result submitted.</p>
          )}
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

    case "manager_note":
      return (
        <div className={styles.managerNote}>
          <span className={styles.time}>{time}</span>
          <span className={styles.managerNoteIcon} aria-hidden="true">
            &#9733;
          </span>
          <span className={styles.eventContent}>
            {str(entry.reason) || str(entry.content)}
          </span>
        </div>
      );

    case "manager_dispatched":
      return (
        <div className={styles.managerNote}>
          <span className={styles.time}>{time}</span>
          <span className={styles.managerNoteIcon} aria-hidden="true">
            &#9733;
          </span>
          <span className={styles.eventContent}>
            Dispatched{entry.reason ? `: ${String(entry.reason)}` : ""}
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
