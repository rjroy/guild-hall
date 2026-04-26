"use client";

import Link from "next/link";
import Breadcrumb from "@/apps/web/components/ui/Breadcrumb";
import DetailHeader from "@/apps/web/components/ui/DetailHeader";
import CopyPathButton from "./CopyPathButton";
import WorkerPortrait from "@/apps/web/components/ui/WorkerPortrait";
import type { BreadcrumbSegment } from "@/apps/web/components/ui/Breadcrumb";
import styles from "./ArtifactProvenance.module.css";

export interface Attribution {
  workerName: string;
  workerTitle?: string;
  workerPortraitUrl?: string;
  commissionId?: string;
  commissionTitle?: string;
}

interface ArtifactProvenanceProps {
  projectName: string;
  projectTitle?: string;
  artifactTitle: string;
  artifactPath: string;
  attribution?: Attribution;
}

/**
 * Combines breadcrumb navigation with worker attribution in a single
 * styled bar. When attribution is present, renders a source row with
 * worker portrait, name, and optional commission link. When absent,
 * the source row is hidden entirely.
 *
 * Delegates container chrome and condensed state to DetailHeader.
 */
export default function ArtifactProvenance({
  projectName,
  projectTitle,
  artifactTitle,
  artifactPath,
  attribution,
}: ArtifactProvenanceProps) {
  const encodedName = encodeURIComponent(projectName);

  const segments: BreadcrumbSegment[] = [
    { label: "Guild Hall", href: "/" },
    { label: projectTitle ?? projectName, href: `/projects/${encodedName}` },
    { label: artifactTitle },
  ];

  return (
    <DetailHeader
      expandedMaxHeight="150px"
      condensedMaxHeight="48px"
      className={styles.artifact}
      condensedContent={(toggleButton) => (
        <>
        <div className={styles.condensedRow}>
          <Breadcrumb segments={segments} />
          <CopyPathButton path={`.lore/${artifactPath}`} />
          <div className={styles.condensedTrailing}>
            {toggleButton}
          </div>
        </div>
        </>
      )}
      expandedContent={(toggleButton) => (
        <>
          <div className={styles.breadcrumbRow}>
            <Breadcrumb segments={segments} />
            <CopyPathButton path={`.lore/${artifactPath}`} />
            {toggleButton}
          </div>
          {attribution && (
            <div className={styles.sourceRow}>
              <WorkerPortrait
                size="sm"
                portraitUrl={attribution.workerPortraitUrl}
              />
              <p className={styles.attributedText}>
                Written by {attribution.workerName}
                {attribution.commissionId && (
                  <>
                    {" for "}
                    <Link
                      href={`/projects/${encodedName}/commissions/${encodeURIComponent(attribution.commissionId)}`}
                      className={styles.commissionLink}
                    >
                      {attribution.commissionTitle || attribution.commissionId}
                    </Link>
                  </>
                )}
              </p>
            </div>
          )}
        </>
      )}
    />
  );
}
