import Link from "next/link";
import Panel from "@/apps/web/components/ui/Panel";
import styles from "./MockupMetadataSidebar.module.css";

interface MockupMetadataSidebarProps {
  filename: string;
  lastModified?: string;
  projectName: string;
}

export default function MockupMetadataSidebar({
  filename,
  lastModified,
  projectName,
}: MockupMetadataSidebarProps) {
  const encodedName = encodeURIComponent(projectName);

  return (
    <Panel size="sm">
      <div className={styles.sidebar}>
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Filename</h3>
          <p className={styles.value}>{filename}</p>
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Format</h3>
          <p className={styles.value}>HTML Mockup</p>
        </div>

        {lastModified && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Last Modified</h3>
            <p className={styles.value}>
              {new Date(lastModified).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        )}

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Project</h3>
          <Link
            href={`/projects/${encodedName}`}
            className={styles.projectLink}
          >
            {projectName}
          </Link>
        </div>
      </div>
    </Panel>
  );
}
