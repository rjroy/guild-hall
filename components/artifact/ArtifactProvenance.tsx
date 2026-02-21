import WorkerPortrait from "@/components/ui/WorkerPortrait";
import styles from "./ArtifactProvenance.module.css";

/**
 * Stubbed for Phase 1. Will display the worker who created or last
 * modified this artifact once sessions and worker tracking are in place.
 */
export default function ArtifactProvenance() {
  return (
    <div className={styles.provenance}>
      <WorkerPortrait size="sm" />
      <p className={styles.text}>Source information unavailable.</p>
    </div>
  );
}
