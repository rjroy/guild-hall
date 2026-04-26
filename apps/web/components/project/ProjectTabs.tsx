import Link from "next/link";
import { Icon, type IconName } from "@/apps/web/components/guild";
import styles from "./ProjectTabs.module.css";

interface ProjectTabsProps {
  projectName: string;
  activeTab: string;
}

const TABS: ReadonlyArray<{ key: string; label: string; icon: IconName }> = [
  { key: "commissions", label: "Commissions", icon: "quill" },
  { key: "artifacts", label: "Artifacts", icon: "folder" },
  { key: "meetings", label: "Meetings", icon: "users" },
];

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
            <Icon name={tab.icon} size={14} />
            <span className={styles.label}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
