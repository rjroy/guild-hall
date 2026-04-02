"use client";

import { useState, useEffect, startTransition } from "react";
import Link from "next/link";
import Panel from "@/web/components/ui/Panel";
import GemIndicator from "@/web/components/ui/GemIndicator";
import EmptyState from "@/web/components/ui/EmptyState";
import { projectDisplayTitle } from "@/lib/types";
import type { ProjectConfig } from "@/lib/types";
import { groupProjects } from "./groupProjects";
import styles from "./WorkspaceSidebar.module.css";

interface WorkspaceSidebarProps {
  projects: ProjectConfig[];
  selectedProject?: string;
}

export default function WorkspaceSidebar({
  projects,
  selectedProject,
}: WorkspaceSidebarProps) {
  const [reversed, setReversed] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    for (const group of groupProjects(projects)) {
      const key = `ws-group-collapsed:${group.name}`;
      const stored = localStorage.getItem(key);
      initial[group.name] = stored === "true";
    }
    startTransition(() => setCollapsed(initial));
  }, [projects]);

  function toggleGroup(groupName: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [groupName]: !prev[groupName] };
      localStorage.setItem(`ws-group-collapsed:${groupName}`, String(next[groupName]));
      return next;
    });
  }

  const groups = groupProjects(projects, reversed);

  return (
    <Panel size="sm">
      <Link href="/" className={styles.homeLink}>
        <h1 className={styles.guildTitle}>Guild Hall</h1>
      </Link>

      <div className={styles.sidebarHeader}>
        <h3 className={styles.sectionHeading}>Active Projects</h3>
        <button
          type="button"
          className={styles.sortToggle}
          onClick={() => setReversed((r) => !r)}
          title={reversed ? "Sort Z→A (click to reverse)" : "Sort A→Z (click to reverse)"}
        >
          {reversed ? "Z→A" : "A→Z"}
        </button>
      </div>

      {projects.length === 0 ? (
        <EmptyState message="No projects registered. Run `guild-hall register <name> <path>` to add your first project." />
      ) : (
        <ul className={styles.projectList}>
          <li className={[styles.projectItem, styles.allProjectsItem, !selectedProject ? styles.selected : ""].filter(Boolean).join(" ")}>
            <Link href="/" className={styles.projectLink}>
              <GemIndicator status={!selectedProject ? "active" : "inactive"} size="sm" />
              <div className={styles.projectInfo}>
                <span className={styles.projectName}>All Projects</span>
              </div>
            </Link>
          </li>

          {groups.map((group) => {
            const isCollapsed = collapsed[group.name] ?? false;
            const displayName =
              group.name.toLowerCase() === "ungrouped"
                ? "Ungrouped"
                : group.name;

            return (
              <li key={group.name} className={styles.groupSection}>
                <button
                  type="button"
                  className={styles.groupHeader}
                  onClick={() => toggleGroup(group.name)}
                  aria-expanded={!isCollapsed}
                >
                  <span className={[styles.groupIndicator, isCollapsed ? styles.collapsed : styles.expanded].join(" ")}>
                    ▾
                  </span>
                  {displayName}
                </button>

                {!isCollapsed && (
                  <ul className={styles.projectList}>
                    {group.projects.map((project) => {
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
                            <GemIndicator status={isSelected ? "active" : "inactive"} size="sm" />
                            <div className={styles.projectInfo}>
                              <span className={styles.projectName}>{projectDisplayTitle(project)}</span>
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
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
