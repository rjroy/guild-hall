import Link from "next/link";
import Panel from "@/components/ui/Panel";
import GemIndicator from "@/components/ui/GemIndicator";
import EmptyState from "@/components/ui/EmptyState";
import type { Artifact } from "@/lib/types";
import styles from "./MeetingList.module.css";

interface MeetingListProps {
  meetings: Artifact[];
  projectName: string;
}

/**
 * Maps meeting status to a gem display state.
 * "open" meetings get active (green), everything else gets pending (amber).
 */
function meetingStatusToGem(status: string): "active" | "pending" {
  return status.toLowerCase() === "open" ? "active" : "pending";
}

/**
 * Extracts a display title from a meeting artifact. Falls back to
 * the filename stem if the frontmatter title is empty.
 */
function meetingTitle(meeting: Artifact): string {
  if (meeting.meta.title) return meeting.meta.title;
  const filename = meeting.relativePath.split("/").pop() ?? meeting.relativePath;
  return filename.replace(/\.md$/, "");
}

/**
 * Extracts the meeting ID from the relative path. Meeting files are
 * expected at meetings/<meetingId>.md.
 */
function meetingIdFromPath(relativePath: string): string {
  const filename = relativePath.split("/").pop() ?? relativePath;
  return filename.replace(/\.md$/, "");
}

export default function MeetingList({
  meetings,
  projectName,
}: MeetingListProps) {
  if (meetings.length === 0) {
    return (
      <Panel>
        <EmptyState message="No meetings yet." />
      </Panel>
    );
  }

  const encodedName = encodeURIComponent(projectName);

  return (
    <Panel size="lg">
      <ul className={styles.list}>
        {meetings.map((meeting) => {
          const status = meeting.meta.status || "open";
          const gem = meetingStatusToGem(status);
          const title = meetingTitle(meeting);
          const meetingId = meetingIdFromPath(meeting.relativePath);
          const isOpen = status.toLowerCase() === "open";
          const rawWorker = meeting.meta.extras?.worker;
          const workerName = typeof rawWorker === "string" ? rawWorker : undefined;

          if (isOpen) {
            return (
              <li key={meeting.relativePath} className={styles.item}>
                <Link
                  href={`/projects/${encodedName}/meetings/${encodeURIComponent(meetingId)}`}
                  className={styles.link}
                >
                  <GemIndicator status={gem} size="sm" />
                  <div className={styles.info}>
                    <p className={styles.title}>{title}</p>
                    <div className={styles.meta}>
                      {meeting.meta.date && (
                        <span className={styles.date}>{meeting.meta.date}</span>
                      )}
                      {workerName && (
                        <span className={styles.worker}>{workerName}</span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          }

          // Closed meetings render as non-interactive entries
          return (
            <li key={meeting.relativePath} className={styles.item}>
              <div className={styles.closedEntry}>
                <GemIndicator status={gem} size="sm" />
                <div className={styles.info}>
                  <p className={styles.title}>{title}</p>
                  <div className={styles.meta}>
                    {meeting.meta.date && (
                      <span className={styles.date}>{meeting.meta.date}</span>
                    )}
                    {workerName && (
                      <span className={styles.worker}>{workerName}</span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
