import InlinePanel from "@/web/components/ui/InlinePanel";
import CollapsibleSidebar from "@/web/components/ui/CollapsibleSidebar";
import styles from "@/web/app/projects/[name]/artifacts/[...path]/page.module.css";

interface ArtifactDetailLayoutProps {
  main: React.ReactNode;
  sidebar: React.ReactNode;
  panelLabel?: string;
}

/**
 * Responsive layout for artifact detail views.
 * On desktop (>768px), renders main content and a collapsible sidebar side-by-side.
 * On mobile (<=768px), hides the desktop sidebar and shows an InlinePanel below main content.
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
        <CollapsibleSidebar
          storageKey="sidebar-collapsed:artifact"
          label={panelLabel}
          width={280}
          className={styles.desktopSidebar}
        >
          {sidebar}
        </CollapsibleSidebar>
      </div>
      <div className={styles.mobileSidebar}>
        <InlinePanel label={panelLabel}>
          {sidebar}
        </InlinePanel>
      </div>
     </>
  );
}
