"use client";

import { useState, useEffect, startTransition } from "react";
import ArtifactBreadcrumb from "./ArtifactBreadcrumb";
import CopyPathButton from "./CopyPathButton";
import WorkerPortrait from "@/web/components/ui/WorkerPortrait";
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
 * Supports condensed state (REQ-DVL-24 through REQ-DVL-29): collapses to
 * a single row with breadcrumb, copy button, and toggle chevron.
 */
export default function ArtifactProvenance({
  projectName,
  artifactTitle,
  artifactPath,
}: ArtifactProvenanceProps) {
  // REQ-DVL-29: Default to condensed on tablet (<=960px) at mount time.
  const [condensed, setCondensed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 960px)").matches;
  });

  // SSR safety: re-check on mount since SSR always returns false.
  useEffect(() => {
    const matches = window.matchMedia("(max-width: 960px)").matches;
    if (matches) {
      startTransition(() => setCondensed(true));
    }
  }, []);

  const provenanceClassName = `${styles.provenance} ${condensed ? styles.provenanceCondensed : ""}`;

  return (
    <div className={provenanceClassName}>
      {condensed ? (
        <div className={styles.condensedRow}>
          <ArtifactBreadcrumb
            projectName={projectName}
            artifactTitle={artifactTitle}
          />
          <CopyPathButton path={`.lore/${artifactPath}`} />
          <div className={styles.condensedTrailing}>
            <button
              type="button"
              className={styles.toggleButton}
              onClick={() => setCondensed(false)}
              aria-label="Expand header"
              aria-expanded={false}
            >
              {"\u25BC"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.breadcrumbRow}>
            <ArtifactBreadcrumb
              projectName={projectName}
              artifactTitle={artifactTitle}
            />
            <CopyPathButton path={`.lore/${artifactPath}`} />
          </div>
          <div className={styles.sourceRow}>
            <WorkerPortrait size="sm" />
            <p className={styles.text}>Source information unavailable.</p>
          </div>
          <button
            type="button"
            className={`${styles.toggleButton} ${styles.toggleExpanded}`}
            onClick={() => setCondensed(true)}
            aria-label="Collapse header"
            aria-expanded={true}
          >
            {"\u25B2"}
          </button>
        </>
      )}
    </div>
  );
}
