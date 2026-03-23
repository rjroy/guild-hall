"use client";

import { useState, useEffect } from "react";
import InlinePanel from "@/web/components/ui/InlinePanel";
import styles from "@/web/app/projects/[name]/artifacts/[...path]/page.module.css";

interface ArtifactDetailLayoutProps {
  main: React.ReactNode;
  sidebar: React.ReactNode;
  panelLabel?: string;
}

/**
 * Client wrapper that handles responsive layout for artifact detail views.
 * On desktop (>768px), renders main content and sidebar side-by-side.
 * On mobile (<=768px), hides the sidebar and shows an InlinePanel below main content.
 */
export default function ArtifactDetailLayout({
  main,
  sidebar,
  panelLabel = "Details",
}: ArtifactDetailLayoutProps) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 768px)").matches;
  });

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 768px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return (
    <div className={styles.artifactBody}>
      <div className={styles.main}>
        {main}
        {isMobile && (
          <InlinePanel label={panelLabel}>
            {sidebar}
          </InlinePanel>
        )}
      </div>
      {!isMobile && (
        <div className={styles.sidebar}>
          {sidebar}
        </div>
      )}
    </div>
  );
}
