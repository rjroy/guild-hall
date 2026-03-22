import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import styles from "./NotesDisplay.module.css";

interface NotesDisplayProps {
  /** Generated notes from closing the meeting, or empty/undefined if generation failed. */
  notes?: string;
  /** URL to navigate back to the project view. */
  projectHref: string;
  /** Project name shown in the back link. */
  projectName: string;
}

/**
 * Displays generated meeting notes after closing a meeting.
 * Shown as a modal overlay before navigating away.
 *
 * REQ-VIEW-35
 */
export default function NotesDisplay({
  notes,
  projectHref,
  projectName,
}: NotesDisplayProps) {
  const hasNotes = notes && notes.trim().length > 0;

  return (
    <div className={styles.overlay} role="dialog" aria-label="Meeting notes">
      <div className={styles.modal}>
        <h2 className={styles.title}>
          {hasNotes ? "Audience Notes" : "Audience Ended"}
        </h2>

        {hasNotes ? (
          <div className={styles.notes}>
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{notes}</ReactMarkdown>
          </div>
        ) : (
          <p className={styles.noNotes}>This audience has ended.</p>
        )}

        <div className={styles.actions}>
          <a href={projectHref} className={styles.backLink}>
            Back to {projectName}
          </a>
        </div>
      </div>
    </div>
  );
}
