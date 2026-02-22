import styles from "./CommissionLinkedArtifacts.module.css";

export interface CommissionArtifact {
  /** Relative path within the project's .lore/ directory */
  path: string;
  /** Display title, derived from filename */
  title: string;
  /** Full URL to the artifact view */
  href: string;
}

interface CommissionLinkedArtifactsProps {
  artifacts: CommissionArtifact[];
  projectName: string;
}

/**
 * Displays artifacts linked to a commission. Each artifact links to its
 * artifact view page. The parent CommissionView updates this list when
 * SSE events report new artifact links.
 */
export default function CommissionLinkedArtifacts({
  artifacts,
}: CommissionLinkedArtifactsProps) {
  return (
    <div className={styles.container}>
      <h3 className={styles.label}>Linked Artifacts</h3>

      {artifacts.length === 0 ? (
        <p className={styles.empty}>No artifacts produced yet.</p>
      ) : (
        <ul className={styles.list}>
          {artifacts.map((artifact) => (
            <li key={artifact.path} className={styles.item}>
              <a href={artifact.href} className={styles.artifactLink}>
                {artifact.title}
              </a>
              <span className={styles.artifactPath}>{artifact.path}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
