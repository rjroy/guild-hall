import Link from "next/link";
import Panel from "@/components/ui/Panel";
import StartAudienceButton from "@/components/project/StartAudienceButton";
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
          Project: {project.name}
        </span>
      </nav>

      <h1 className={styles.heading}>{project.name}</h1>

      {project.description && (
        <p className={styles.description}>{project.description}</p>
      )}

      <div className={styles.actions}>
        {project.repoUrl && (
          <a
            href={project.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.repoLink}
          >
            View Repository &#8599;
          </a>
        )}

        <StartAudienceButton projectName={project.name} />
      </div>
    </Panel>
  );
}
