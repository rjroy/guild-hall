import Link from "next/link";
import Panel from "@/components/ui/Panel";
import GemIndicator from "@/components/ui/GemIndicator";
import EmptyState from "@/components/ui/EmptyState";
import type { ProjectConfig } from "@/lib/types";
import styles from "./WorkspaceSidebar.module.css";

interface WorkspaceSidebarProps {
  projects: ProjectConfig[];
  selectedProject?: string;
}

export default function WorkspaceSidebar({
  projects,
  selectedProject,
}: WorkspaceSidebarProps) {
  return (
    <Panel size="sm">
      <Link href="/" className={styles.homeLink}>
        <h1 className={styles.guildTitle}>Guild Hall</h1>
      </Link>

      <h3 className={styles.sectionHeading}>Active Projects</h3>

      {projects.length === 0 ? (
        <EmptyState message="No projects registered. Run `guild-hall register <name> <path>` to add your first project." />
      ) : (
        <ul className={styles.projectList}>
          {projects.map((project) => {
            const isSelected = project.name === selectedProject;
            const itemClass = [
              styles.projectItem,
              isSelected ? styles.selected : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <li key={project.name} className={itemClass}>
                <Link
                  href={`/?project=${encodeURIComponent(project.name)}`}
                  className={styles.projectLink}
                >
                  <GemIndicator status="info" size="sm" />
                  <div className={styles.projectInfo}>
                    <span className={styles.projectName}>{project.name}</span>
                    {project.description && (
                      <span className={styles.projectDescription}>
                        {project.description}
                      </span>
                    )}
                  </div>
                </Link>
                <Link
                  href={`/projects/${encodeURIComponent(project.name)}`}
                  className={styles.viewProjectLink}
                >
                  View &rsaquo;
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
