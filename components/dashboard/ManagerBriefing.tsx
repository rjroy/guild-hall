import Panel from "@/components/ui/Panel";
import EmptyState from "@/components/ui/EmptyState";
import styles from "./ManagerBriefing.module.css";

export default function ManagerBriefing() {
  return (
    <Panel title="Guild Master's Briefing">
      {/* Static decorative asset. next/image optimization not beneficial. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/ui/scroll-window.webp"
        alt=""
        className={styles.divider}
        aria-hidden="true"
      />
      <EmptyState message="No Guild Master configured." />
    </Panel>
  );
}
