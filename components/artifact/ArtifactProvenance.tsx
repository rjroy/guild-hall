import ArtifactBreadcrumb from "./ArtifactBreadcrumb";
import WorkerPortrait from "@/components/ui/WorkerPortrait";
import styles from "./ArtifactProvenance.module.css";

interface ArtifactProvenanceProps {
  projectName: string;
  artifactTitle: string;
}

/**
 * Combines the breadcrumb navigation with source/provenance info
 * in a single styled bar. The provenance line is stubbed for Phase 1
 * and will display the worker who created or last modified this artifact
 * once sessions and worker tracking are in place.
 */
export default function ArtifactProvenance({
  projectName,
  artifactTitle,
}: ArtifactProvenanceProps) {
  return (
    <div className={styles.provenance}>
      <ArtifactBreadcrumb
        projectName={projectName}
        artifactTitle={artifactTitle}
      />
      <div className={styles.sourceRow}>
        <WorkerPortrait size="sm" />
        <p className={styles.text}>Source information unavailable.</p>
      </div>
    </div>
  );
}
