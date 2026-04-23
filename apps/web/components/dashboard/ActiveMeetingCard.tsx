import Link from "next/link";
import WorkerPortrait from "@/apps/web/components/ui/WorkerPortrait";
import type { MeetingMeta } from "@/lib/meetings";
import styles from "./ActiveMeetingCard.module.css";

export interface ActiveMeetingCardProps {
  meeting: MeetingMeta;
  portraitUrl?: string;
}

export function activeMeetingHref(projectName: string, meetingId: string): string {
  return `/projects/${encodeURIComponent(projectName)}/meetings/${encodeURIComponent(meetingId)}`;
}

export function workerDisplayLabel(workerDisplayTitle: string, worker: string): string {
  return workerDisplayTitle || worker || "Unknown Worker";
}

/**
 * Navigation-only card for an active (open) meeting.
 * The entire card is a link — no action buttons.
 * REQ-FPM-02, REQ-FPM-03, REQ-FPM-05, REQ-FPM-09
 */
export default function ActiveMeetingCard({ meeting, portraitUrl }: ActiveMeetingCardProps) {
  const workerLabel = workerDisplayLabel(meeting.workerDisplayTitle, meeting.worker);
  const href = activeMeetingHref(meeting.projectName, meeting.meetingId);

  return (
    <Link href={href} className={styles.card}>
      <span className={styles.liveIndicator} aria-label="Live" />
      <WorkerPortrait name={workerLabel} portraitUrl={portraitUrl} size="sm" />
      <div className={styles.content}>
        <p className={styles.workerTitle}>{workerLabel}</p>
        <p className={styles.meetingTitle}>{meeting.title}</p>
        <p className={styles.meta}>
          {meeting.projectName} · {meeting.date}
        </p>
      </div>
    </Link>
  );
}
