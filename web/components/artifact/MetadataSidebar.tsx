import Link from "next/link";
import Panel from "@/web/components/ui/Panel";
import GemIndicator from "@/web/components/ui/GemIndicator";
import EmptyState from "@/web/components/ui/EmptyState";
import type { ArtifactMeta } from "@/lib/types";
import { statusToGem } from "@/lib/types";
import type { CommissionMeta } from "@/lib/commissions";
import styles from "./MetadataSidebar.module.css";

interface MetadataSidebarProps {
  meta: ArtifactMeta;
  projectName: string;
  /** .lore/-relative path for the current artifact (e.g. "specs/my-spec.md") */
  artifactPath?: string;
  /** Commissions whose linked_artifacts include this artifact */
  associatedCommissions?: CommissionMeta[];
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

/**
 * Builds the href for the "Create Commission from Artifact" link.
 * Navigates to the project's commissions tab with query params that
 * auto-open the form and pre-fill the dependencies field.
 */
export function createCommissionHref(
  projectName: string,
  artifactPath: string,
): string {
  const encodedName = encodeURIComponent(projectName);
  const encodedPath = encodeURIComponent(artifactPath);
  return `/projects/${encodedName}?tab=commissions&newCommission=true&dep=${encodedPath}`;
}

/**
 * Builds the href for the "Request Meeting" link.
 * Navigates to the project's meetings tab with query params that
 * auto-open the form and pre-fill the artifact context.
 */
export function requestMeetingHref(
  projectName: string,
  artifactPath: string,
): string {
  const encodedName = encodeURIComponent(projectName);
  const encodedPath = encodeURIComponent(artifactPath);
  return `/projects/${encodedName}?tab=meetings&newMeeting=true&artifact=${encodedPath}`;
}

export default function MetadataSidebar({
  meta,
  projectName,
  artifactPath,
  associatedCommissions = [],
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

        {/* Path */}
        {artifactPath && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Path</h3>
            <p className={styles.value}>{artifactPath}</p>
          </div>
        )}

        {/* Type */}
        {meta.type && meta.type.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Type</h3>
            <div className={styles.badges}>
              <span className={styles.badge}>
                {meta.type}
              </span>
            </div>
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

        {/* Associated Commissions */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Associated Commissions</h3>
          {associatedCommissions.length > 0 ? (
            <ul className={styles.commissionList}>
              {associatedCommissions.map((c) => (
                <li key={c.commissionId}>
                  <Link
                    href={`/projects/${encodedName}/commissions/${encodeURIComponent(c.commissionId)}`}
                    className={styles.commissionLink}
                  >
                    <GemIndicator status={statusToGem(c.status)} size="sm" />
                    <span className={styles.commissionTitle}>
                      {c.title || c.commissionId}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="No commissions reference this artifact." />
          )}
        </div>

        {/* Actions */}
        {artifactPath && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Actions</h3>
            <div className={styles.actionLinks}>
              <Link
                href={createCommissionHref(projectName, artifactPath)}
                className={styles.actionLink}
              >
                Create Commission from Artifact
              </Link>
              <Link
                href={requestMeetingHref(projectName, artifactPath)}
                className={styles.actionLink}
              >
                Request Meeting
              </Link>
            </div>
          </div>
        )}

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
