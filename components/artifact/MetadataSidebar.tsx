import Link from "next/link";
import Panel from "@/components/ui/Panel";
import GemIndicator from "@/components/ui/GemIndicator";
import EmptyState from "@/components/ui/EmptyState";
import type { ArtifactMeta } from "@/lib/types";
import { statusToGem } from "@/lib/types";
import styles from "./MetadataSidebar.module.css";

interface MetadataSidebarProps {
  meta: ArtifactMeta;
  projectName: string;
}

/**
 * Strips a leading ".lore/" prefix from a related path so it can be
 * used as a relative artifact link. Paths in the related field are
 * typically stored as ".lore/specs/foo.md" but the artifact route
 * expects the path relative to the .lore/ root.
 */
export function relatedToHref(
  relatedPath: string,
  projectName: string
): string {
  const stripped = relatedPath.replace(/^\.lore\//, "");
  const encodedName = encodeURIComponent(projectName);
  const encoded = stripped.split("/").map(encodeURIComponent).join("/");
  return `/projects/${encodedName}/artifacts/${encoded}`;
}

export default function MetadataSidebar({
  meta,
  projectName,
}: MetadataSidebarProps) {
  const encodedName = encodeURIComponent(projectName);
  const gemStatus = meta.status ? statusToGem(meta.status) : "info";

  return (
    <Panel size="sm">
      <div className={styles.sidebar}>
        {/* Status */}
        {meta.status && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Status</h3>
            <div className={styles.statusRow}>
              <GemIndicator status={gemStatus} size="sm" />
              <span className={styles.statusText}>{meta.status}</span>
            </div>
          </div>
        )}

        {/* Date */}
        {meta.date && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Date</h3>
            <p className={styles.value}>{meta.date}</p>
          </div>
        )}

        {/* Tags */}
        {meta.tags.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Tags</h3>
            <div className={styles.badges}>
              {meta.tags.map((tag) => (
                <span key={tag} className={styles.badge}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Modules */}
        {meta.modules && meta.modules.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Modules</h3>
            <div className={styles.badges}>
              {meta.modules.map((mod) => (
                <span key={mod} className={styles.badge}>
                  {mod}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Project link */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Project</h3>
          <Link
            href={`/projects/${encodedName}`}
            className={styles.projectLink}
          >
            {projectName}
          </Link>
        </div>

        {/* Associated Commissions (stubbed) */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Associated Commissions</h3>
          <EmptyState message="No commissions reference this artifact." />
          <button className={styles.disabledButton} disabled>
            Create Commission from Artifact
          </button>
        </div>

        {/* Related artifacts */}
        {meta.related && meta.related.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Related</h3>
            <ul className={styles.relatedList}>
              {meta.related.map((relPath) => (
                <li key={relPath}>
                  <Link
                    href={relatedToHref(relPath, projectName)}
                    className={styles.relatedLink}
                  >
                    {relPath.replace(/^\.lore\//, "")}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}
