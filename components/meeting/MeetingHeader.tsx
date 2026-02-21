import Link from "next/link";
import WorkerPortrait from "@/components/ui/WorkerPortrait";
import styles from "./MeetingHeader.module.css";

interface MeetingHeaderProps {
  projectName: string;
  workerName: string;
  workerDisplayTitle: string;
  workerPortraitUrl?: string;
  agenda: string;
}

export default function MeetingHeader({
  projectName,
  workerName,
  workerDisplayTitle,
  workerPortraitUrl,
  agenda,
}: MeetingHeaderProps) {
  const encodedName = encodeURIComponent(projectName);

  return (
    <div className={styles.header}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link href="/" className={styles.breadcrumbLink}>
          Guild Hall
        </Link>
        <span className={styles.separator} aria-hidden="true">
          &rsaquo;
        </span>
        <Link
          href={`/projects/${encodedName}`}
          className={styles.breadcrumbLink}
        >
          Project: {projectName}
        </Link>
        <span className={styles.separator} aria-hidden="true">
          &rsaquo;
        </span>
        <span className={styles.breadcrumbCurrent}>Audience</span>
      </nav>

      <div className={styles.headerContent}>
        <div className={styles.workerInfo}>
          <WorkerPortrait
            name={workerName}
            title={workerDisplayTitle}
            portraitUrl={workerPortraitUrl}
            size="lg"
          />
        </div>
        <div className={styles.agendaPanel}>
          <h3 className={styles.agendaTitle}>Agenda</h3>
          <p className={styles.agendaText}>{agenda}</p>
        </div>
      </div>
    </div>
  );
}
