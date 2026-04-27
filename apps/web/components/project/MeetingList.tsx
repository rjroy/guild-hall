import Link from "next/link";
import Panel from "@/apps/web/components/ui/Panel";
import StatusBadge from "@/apps/web/components/ui/StatusBadge";
import EmptyState from "@/apps/web/components/ui/EmptyState";
import type { Artifact } from "@/lib/types";
import { statusToGem } from "@/lib/types";
import styles from "./MeetingList.module.css";

interface MeetingListProps {
  meetings: Artifact[];
  projectName: string;
}

/**
 * Resolves a preview string from a meeting artifact.
 * Priority: agenda > first non-empty, non-heading line of notes > undefined.
 */
export function previewText(meeting: Artifact): string | undefined {
  const agenda = meeting.meta.extras?.agenda;
  if (typeof agenda === "string" && agenda.trim()) return agenda;

  const content = meeting.content;
  if (typeof content === "string" && content.trim()) {
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^#+\s/.test(trimmed)) continue;
      return trimmed;
    }
  }

  return undefined;
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

/**
 * Returns the href for a meeting based on its status.
 *
 * - "open": live meeting view (/projects/<name>/meetings/<id>)
 * - "closed": artifact view of the meeting notes (/projects/<name>/artifacts/<relativePath>)
 * - other statuses: null (not linkable)
 */
export function meetingHref(
  status: string,
  projectName: string,
  relativePath: string,
): string | null {
  const normalized = status.toLowerCase().trim();
  const encodedName = encodeURIComponent(projectName);

  if (normalized === "open") {
    const meetingId = meetingIdFromPath(relativePath);
    return `/projects/${encodedName}/meetings/${encodeURIComponent(meetingId)}`;
  }

  if (normalized === "closed") {
    // relativePath from scanArtifacts is relative to .lore/ and is always
    // prefixed with either `meetings/` (legacy flat layout) or
    // `work/meetings/` (REQ-LDR-19). The artifact viewer accepts either.
    return `/projects/${encodedName}/artifacts/${relativePath}`;
  }

  return null;
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

  return (
    <Panel size="lg">
      <ul className={styles.list}>
        {meetings.map((meeting) => {
          const status = (meeting.meta.status || "open").toLowerCase().trim();
          const gem = statusToGem(status);
          const title = meetingTitle(meeting);
          const rawWorker = meeting.meta.extras?.worker;
          const workerName = typeof rawWorker === "string" ? rawWorker : undefined;
          const preview = previewText(meeting);

          // Open meetings link to the live meeting view
          if (status === "open") {
            return (
              <li key={meeting.relativePath} className={styles.item}>
                <Link
                  href={meetingHref(status, projectName, meeting.relativePath)!}
                  className={styles.link}
                >
                  <StatusBadge gem={gem} label={status} size="sm" />
                  <div className={styles.info}>
                    <p className={styles.title}>{title}</p>
                    {preview && (
                      <p className={styles.preview}>{preview}</p>
                    )}
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

          // Requested meetings show an amber gem with an "Accept" link.
          // The Accept link navigates to the dashboard where PendingAudiences
          // provides the full accept/defer/ignore flow.
          if (status === "requested") {
            return (
              <li key={meeting.relativePath} className={styles.item}>
                <div className={styles.requestedEntry}>
                  <StatusBadge gem={gem} label={status} size="sm" />
                  <div className={styles.info}>
                    <p className={styles.title}>{title}</p>
                    {preview && (
                      <p className={styles.preview}>{preview}</p>
                    )}
                    <div className={styles.meta}>
                      {meeting.meta.date && (
                        <span className={styles.date}>{meeting.meta.date}</span>
                      )}
                      {workerName && (
                        <span className={styles.worker}>{workerName}</span>
                      )}
                    </div>
                  </div>
                  <Link href="/" className={styles.acceptLink}>
                    Accept
                  </Link>
                </div>
              </li>
            );
          }

          // Closed meetings link to the artifact view (read-only notes)
          if (status === "closed") {
            return (
              <li key={meeting.relativePath} className={styles.item}>
                <Link
                  href={meetingHref(status, projectName, meeting.relativePath)!}
                  className={`${styles.link} ${styles.closedLink}`}
                >
                  <StatusBadge gem={gem} label={status} size="sm" />
                  <div className={styles.info}>
                    <p className={styles.title}>{title}</p>
                    {preview && (
                      <p className={styles.preview}>{preview}</p>
                    )}
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

          // Declined and other meetings render as non-interactive entries
          return (
            <li key={meeting.relativePath} className={styles.item}>
              <div className={styles.closedEntry}>
                <StatusBadge gem={gem} label={status} size="sm" />
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
