import Link from "next/link";
import styles from "./ArtifactBreadcrumb.module.css";

interface ArtifactBreadcrumbProps {
  projectName: string;
  artifactTitle: string;
}

export default function ArtifactBreadcrumb({
  projectName,
  artifactTitle,
}: ArtifactBreadcrumbProps) {
  const encodedName = encodeURIComponent(projectName);

  return (
    <nav className={styles.breadcrumb} aria-label="Breadcrumb">
      <Link href="/" className={styles.link}>
        Guild Hall
      </Link>
      <span className={styles.separator} aria-hidden="true">
        &rsaquo;
      </span>
      <Link href={`/projects/${encodedName}`} className={styles.link}>
        Project: {projectName}
      </Link>
      <span className={styles.separator} aria-hidden="true">
        &rsaquo;
      </span>
      <span className={styles.current}>Artifact: {artifactTitle}</span>
    </nav>
  );
}
