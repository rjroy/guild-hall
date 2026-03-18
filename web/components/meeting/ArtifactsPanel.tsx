import styles from "./ArtifactsPanel.module.css";

export interface LinkedArtifact {
  /** Relative path within the project's .lore/ directory */
  path: string;
  /** Display title, derived from filename or artifact metadata */
  title: string;
  /** Whether the artifact file exists on disk */
  exists: boolean;
  /** Full URL to the artifact view */
  href: string;
}

interface ArtifactsPanelProps {
  artifacts: LinkedArtifact[];
  /** Whether the panel body is expanded. Defaults to true. */
  expanded?: boolean;
  /** Called when the user clicks the header to toggle expand/collapse. */
  onToggle?: () => void;
}

/**
 * Sidebar panel showing artifacts linked to a meeting.
 * Populated by the link_artifact tool during conversation.
 *
 * Expand/collapse state is managed by the parent component so this
 * component stays hook-free and testable outside a React render context.
 *
 * REQ-VIEW-30
 */
export default function ArtifactsPanel({
  artifacts,
  expanded = true,
  onToggle,
}: ArtifactsPanelProps) {
  return (
    <div className={styles.panel}>
      <button
        className={styles.header}
        onClick={onToggle}
        aria-expanded={expanded}
        type="button"
      >
        <h3 className={styles.title}>Linked Artifacts</h3>
        <span
          className={`${styles.toggleIcon} ${expanded ? styles.toggleIconExpanded : ""}`}
          aria-hidden="true"
        >
          {"\u25B6"}
        </span>
      </button>

      {expanded && (
        <>
          {artifacts.length === 0 ? (
            <p className={styles.empty}>No artifacts linked yet.</p>
          ) : (
            <ul className={styles.list}>
              {artifacts.map((artifact) => (
                <li key={artifact.path} className={styles.item}>
                  {artifact.exists ? (
                    <a href={artifact.href} className={styles.artifactLink}>
                      {artifact.title}
                    </a>
                  ) : (
                    <span className={styles.artifactLink}>{artifact.title}</span>
                  )}
                  <span className={styles.artifactPath}>
                    {artifact.path}
                    {!artifact.exists && (
                      <span className={styles.notFound}> (not found)</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
