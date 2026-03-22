import Link from "next/link";
import Panel from "@/web/components/ui/Panel";
import type { ProjectConfig } from "@/lib/types";
import styles from "./ProjectHeader.module.css";

interface ProjectHeaderProps {
  project: ProjectConfig;
}

export default function ProjectHeader({ project }: ProjectHeaderProps) {
  return (
    <Panel size="lg">
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link href="/" className={styles.breadcrumbLink}>
          Guild Hall
        </Link>
        <span className={styles.breadcrumbSeparator} aria-hidden="true">
          &rsaquo;
        </span>
        <span className={styles.breadcrumbCurrent}>
          {project.name}
        </span>
      </nav>

      <h1 className={styles.heading}>{project.name}</h1>

      {project.description && (
        <p className={styles.description}>{project.description}</p>
      )}

      {project.repoUrl && (
        <div className={styles.actions}>
          <a
            href={project.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.repoLink}
          >
            View Repository &#8599;
          </a>
        </div>
      )}
    </Panel>
  );
}
