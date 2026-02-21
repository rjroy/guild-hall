import Link from "next/link";
import Panel from "@/components/ui/Panel";
import GemIndicator from "@/components/ui/GemIndicator";
import EmptyState from "@/components/ui/EmptyState";
import type { Artifact } from "@/lib/types";
import { statusToGem } from "@/lib/types";
import { capitalize, displayTitle, groupArtifacts } from "@/lib/artifact-grouping";
import styles from "./ArtifactList.module.css";

interface ArtifactListProps {
  artifacts: Artifact[];
  projectName: string;
}

export default function ArtifactList({
  artifacts,
  projectName,
}: ArtifactListProps) {
  if (artifacts.length === 0) {
    return (
      <Panel>
        <EmptyState message="No artifacts found in this project." />
      </Panel>
    );
  }

  const groups = groupArtifacts(artifacts);
  const encodedName = encodeURIComponent(projectName);

  return (
    <Panel size="lg">
      {groups.map(({ group, items }) => (
        <div key={group} className={styles.group}>
          <h3 className={styles.groupHeading}>{capitalize(group)}</h3>
          <ul className={styles.list}>
            {items.map((artifact) => {
              const gemStatus = statusToGem(artifact.meta.status);
              return (
                <li key={artifact.relativePath} className={styles.item}>
                  <Link
                    href={`/projects/${encodedName}/artifacts/${artifact.relativePath}`}
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
                      <div className={styles.meta}>
                        {artifact.meta.date && (
                          <span className={styles.date}>
                            {artifact.meta.date}
                          </span>
                        )}
                        {artifact.meta.tags.length > 0 && (
                          <div className={styles.tags}>
                            {artifact.meta.tags.map((tag) => (
                              <span key={tag} className={styles.tag}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <GemIndicator status={gemStatus} size="sm" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </Panel>
  );
}
