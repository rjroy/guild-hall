import { BoardPanel } from "@/components/board/BoardPanel";
import { RosterPanel } from "@/components/roster/RosterPanel";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>Guild Hall</h1>
        <span className={styles.headerBadge}>Phase I</span>
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
