import Link from "next/link";
import Panel from "@/components/ui/Panel";
import GemIndicator from "@/components/ui/GemIndicator";
import EmptyState from "@/components/ui/EmptyState";
import type { Artifact } from "@/lib/types";
import { statusToGem } from "@/lib/types";
import styles from "./RecentArtifacts.module.css";

interface RecentArtifactsProps {
  artifacts: Artifact[];
  projectName?: string;
}

/**
 * Derives a display title from an artifact.
 * Uses the frontmatter title if available, otherwise falls back to the
 * filename without extension.
 */
function displayTitle(artifact: Artifact): string {
  if (artifact.meta.title) {
    return artifact.meta.title;
  }
  const segments = artifact.relativePath.split("/");
  const filename = segments[segments.length - 1];
  return filename.replace(/\.md$/, "");
}

/**
 * Determines the correct href for an artifact in the dashboard feed.
 * Open meeting artifacts link to the meeting view; everything else
 * links to the standard artifact view.
 */
export function artifactHref(
  artifact: Artifact,
  projectName: string
): string {
  const encodedName = encodeURIComponent(projectName);
  const isMeeting = artifact.relativePath.startsWith("meetings/");
  const isOpen = artifact.meta.status.toLowerCase().trim() === "open";

  if (isMeeting && isOpen) {
    const filename = artifact.relativePath.split("/").pop() ?? "";
    const meetingId = filename.replace(/\.md$/, "");
    return `/projects/${encodedName}/meetings/${encodeURIComponent(meetingId)}`;
  }

  return `/projects/${encodedName}/artifacts/${artifact.relativePath}`;
}

export default function RecentArtifacts({
  artifacts,
  projectName,
}: RecentArtifactsProps) {
  return (
    <Panel title="Recent Scrolls">
      {!projectName ? (
        <EmptyState message="Select a project to view recent artifacts." />
      ) : artifacts.length === 0 ? (
        <EmptyState message="No artifacts found." />
      ) : (
        <ul className={styles.list}>
          {artifacts.map((artifact) => {
            const gemStatus = statusToGem(artifact.meta.status);
            return (
              <li key={artifact.relativePath} className={styles.item}>
                <Link
                  href={artifactHref(artifact, projectName)}
                  className={styles.link}
                >
                  {/* Static decorative icon. next/image optimization not beneficial. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/ui/scroll-icon.webp"
                    alt=""
                    className={styles.scrollIcon}
                    aria-hidden="true"
                  />
                  <div className={styles.info}>
                    <span className={styles.title}>
                      {displayTitle(artifact)}
                    </span>
                    {artifact.meta.date && (
                      <span className={styles.date}>{artifact.meta.date}</span>
                    )}
                  </div>
                  <GemIndicator status={gemStatus} size="sm" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
