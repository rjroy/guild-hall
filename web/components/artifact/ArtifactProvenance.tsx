"use client";

import Breadcrumb from "@/web/components/ui/Breadcrumb";
import DetailHeader from "@/web/components/ui/DetailHeader";
import CopyPathButton from "./CopyPathButton";
import WorkerPortrait from "@/web/components/ui/WorkerPortrait";
import type { BreadcrumbSegment } from "@/web/components/ui/Breadcrumb";
import styles from "./ArtifactProvenance.module.css";

interface ArtifactProvenanceProps {
  projectName: string;
  artifactTitle: string;
  artifactPath: string;
}

/**
 * Combines the breadcrumb navigation with source/provenance info
 * in a single styled bar. The provenance line is stubbed for Phase 1
 * and will display the worker who created or last modified this artifact
 * once sessions and worker tracking are in place.
 *
 * Delegates container chrome and condensed state to DetailHeader.
 */
export default function ArtifactProvenance({
  projectName,
  artifactTitle,
  artifactPath,
}: ArtifactProvenanceProps) {
  const encodedName = encodeURIComponent(projectName);

  const segments: BreadcrumbSegment[] = [
    { label: "Guild Hall", href: "/" },
    { label: projectName, href: `/projects/${encodedName}` },
    { label: artifactTitle },
  ];

  return (
    <DetailHeader
      expandedMaxHeight="150px"
      condensedMaxHeight="48px"
      className={styles.artifact}
      condensedContent={(toggleButton) => (
        <div className={styles.condensedRow}>
          <Breadcrumb segments={segments} />
          <CopyPathButton path={`.lore/${artifactPath}`} />
          <div className={styles.condensedTrailing}>
            {toggleButton}
          </div>
        </div>
      )}
      expandedContent={(toggleButton) => (
        <>
          <div className={styles.breadcrumbRow}>
            <Breadcrumb segments={segments} />
            <CopyPathButton path={`.lore/${artifactPath}`} />
            {toggleButton}
          </div>
          <div className={styles.sourceRow}>
            <WorkerPortrait size="sm" />
            <p className={styles.text}>Source information unavailable.</p>
          </div>
        </>
      )}
    />
  );
}
