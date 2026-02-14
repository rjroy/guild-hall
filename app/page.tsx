import { BoardPanel } from "@/components/board/BoardPanel";
import { RosterPanel } from "@/components/roster/RosterPanel";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>Guild Hall</h1>
          <span className={styles.headerBadge}>Phase I</span>
        </div>
        <ThemeToggle />
      </header>

      <aside className={styles.rosterColumn}>
        <RosterPanel />
      </aside>

      <main className={styles.boardColumn}>
        <BoardPanel />
      </main>
    </div>
  );
}
