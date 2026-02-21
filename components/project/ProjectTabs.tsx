import Link from "next/link";
import GemIndicator from "@/components/ui/GemIndicator";
import styles from "./ProjectTabs.module.css";

interface ProjectTabsProps {
  projectName: string;
  activeTab: string;
}

const TABS = [
  { key: "commissions", label: "Commissions" },
  { key: "artifacts", label: "Artifacts" },
  { key: "meetings", label: "Meetings" },
] as const;

export default function ProjectTabs({
  projectName,
  activeTab,
}: ProjectTabsProps) {
  const encodedName = encodeURIComponent(projectName);

  return (
    <nav className={styles.tabBar} aria-label="Project sections">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const className = [styles.tab, isActive ? styles.active : ""]
          .filter(Boolean)
          .join(" ");

        return (
          <Link
            key={tab.key}
            href={`/projects/${encodedName}?tab=${tab.key}`}
            className={className}
            aria-current={isActive ? "page" : undefined}
          >
            <GemIndicator status="info" size="sm" />
            <span className={styles.label}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
