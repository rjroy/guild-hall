"use client";

import Breadcrumb from "@/web/components/ui/Breadcrumb";
import DetailHeader from "@/web/components/ui/DetailHeader";
import type { BreadcrumbSegment } from "@/web/components/ui/Breadcrumb";
import type { ProjectConfig } from "@/lib/types";
import styles from "./ProjectHeader.module.css";

interface ProjectHeaderProps {
  project: ProjectConfig;
}

export default function ProjectHeader({ project }: ProjectHeaderProps) {
  const segments: BreadcrumbSegment[] = [
    { label: "Guild Hall", href: "/" },
    { label: project.name },
  ];

  const title = project.repoUrl ? (
    <a
      href={project.repoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.titleLink}
    >
      {project.name} <span className={styles.externalIcon}>&#8599;</span>
    </a>
  ) : (
    <span>{project.name}</span>
  );

  return (
    <DetailHeader
      expandedMaxHeight="250px"
      condensedMaxHeight="56px"
      condensedContent={(toggleButton) => (
        <div className={styles.condensedRow}>
          <div className={styles.condensedLeft}>
            <Breadcrumb segments={segments} />
            <h1 className={styles.headingCondensed}>{title}</h1>
          </div>
          <div className={styles.condensedTrailing}>
            {toggleButton}
          </div>
        </div>
      )}
      expandedContent={(toggleButton) => (
        <>
          <div className={styles.breadcrumbRow}>
            <Breadcrumb segments={segments} />
            {toggleButton}
          </div>
          <h1 className={styles.heading}>{title}</h1>
          {project.description && (
            <p className={styles.description}>{project.description}</p>
          )}
        </>
      )}
    />
  );
}
