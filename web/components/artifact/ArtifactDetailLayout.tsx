import InlinePanel from "@/web/components/ui/InlinePanel";
import styles from "@/web/app/projects/[name]/artifacts/[...path]/page.module.css";

interface ArtifactDetailLayoutProps {
  main: React.ReactNode;
  sidebar: React.ReactNode;
  panelLabel?: string;
}

/**
 * Responsive layout for artifact detail views.
 * On desktop (>768px), renders main content and sidebar side-by-side.
 * On mobile (<=768px), hides the sidebar and shows an InlinePanel below main content.
 * Uses CSS media queries instead of JS state to avoid hydration mismatches.
 */
export default function ArtifactDetailLayout({
  main,
  sidebar,
  panelLabel = "Details",
}: ArtifactDetailLayoutProps) {
  return (
    <>
     <div className={styles.artifactBody}>
        <div className={styles.main}>
          {main}
        </div>
        <div className={styles.sidebar}>
          {sidebar}
        </div>
      </div>
      <div className={styles.mobileSidebar}>
        <InlinePanel label={panelLabel}>
          {sidebar}
        </InlinePanel>
      </div>
     </>
  );
}
