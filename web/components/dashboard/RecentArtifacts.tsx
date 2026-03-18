import Link from "next/link";
import Panel from "@/web/components/ui/Panel";
import StatusBadge from "@/web/components/ui/StatusBadge";
import EmptyState from "@/web/components/ui/EmptyState";
import { displayTitle } from "@/lib/artifact-grouping";
import type { Artifact, ArtifactWithProject } from "@/lib/types";
import { statusToGem } from "@/lib/types";
import styles from "./RecentArtifacts.module.css";

interface RecentArtifactsProps {
  artifacts: ArtifactWithProject[];
  selectedProject?: string;
}

/**
 * Determines the correct href for an artifact in the dashboard feed.
 *
 * Meeting artifacts route based on status:
 * - "open": link to the live meeting view
 * - "requested": link to the project meetings tab (where MeetingList
 *   shows the Accept action)
 * - "declined" / "closed" / other: link to the standard artifact view
 *   (read-only)
 *
 * Non-meeting artifacts always link to the standard artifact view.
 */
export function artifactHref(
  artifact: Artifact,
  projectName: string
): string {
  const encodedName = encodeURIComponent(projectName);
  const isMeeting = artifact.relativePath.startsWith("meetings/");

  if (isMeeting) {
    const status = artifact.meta.status.toLowerCase().trim();

    if (status === "open") {
      const filename = artifact.relativePath.split("/").pop() ?? "";
      const meetingId = filename.replace(/\.md$/, "");
      return `/projects/${encodedName}/meetings/${encodeURIComponent(meetingId)}`;
    }

    if (status === "requested") {
      return `/projects/${encodedName}?tab=meetings`;
    }
  }

  return `/projects/${encodedName}/artifacts/${artifact.relativePath}`;
}

// Server component: receives ArtifactWithProject[] with lastModified: Date.
// Do NOT add "use client" — Date objects don't serialize cleanly
// through the RSC protocol and would cause hydration mismatches.
export default function RecentArtifacts({
  artifacts,
  selectedProject,
}: RecentArtifactsProps) {
  const showProjectLabel = !selectedProject;

  return (
    <Panel title="Recent Scrolls">
      {artifacts.length === 0 ? (
        <EmptyState message="No recent artifacts." />
      ) : (
        <ul className={styles.list}>
          {artifacts.map((artifact) => {
            const gemStatus = statusToGem(artifact.meta.status);
            return (
              <li key={`${artifact.projectName}-${artifact.relativePath}`} className={styles.item}>
                <Link
                  href={artifactHref(artifact, artifact.projectName)}
                  className={styles.link}
                >
                  {artifact.artifactType === "image" ? (
                    <span className={styles.imageIcon} aria-hidden="true">{"\uD83D\uDDBC"}</span>
                  ) : (
                    /* Static decorative icon. next/image optimization not beneficial. */
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src="/images/ui/scroll-icon.webp"
                      alt=""
                      className={styles.scrollIcon}
                      aria-hidden="true"
                    />
                  )}
                  <div className={styles.info}>
                    <span className={styles.title}>
                      {displayTitle(artifact)}
                    </span>
                    {showProjectLabel && (
                      <span className={styles.projectLabel}>{artifact.projectName}</span>
                    )}
                    {artifact.meta.date && (
                      <span className={styles.date}>{artifact.meta.date}</span>
                    )}
                  </div>
                  <StatusBadge gem={gemStatus} label={artifact.meta.status} size="sm" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
