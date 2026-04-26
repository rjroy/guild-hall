import Panel from "./Panel";
import styles from "./DaemonError.module.css";

interface DaemonErrorProps {
  message?: string;
}

/**
 * Error page shown when the daemon is unavailable and a server component
 * cannot fetch the data it needs.
 */
export default function DaemonError({
  message = "The Guild Hall daemon is not running. Start it with: bun run dev:daemon",
}: DaemonErrorProps) {
  return (
    <div className={styles.container}>
      <Panel size="lg">
        <div className={styles.content}>
          <h2 className={styles.title}>Daemon Unavailable</h2>
          <p className={styles.message}>{message}</p>
        </div>
      </Panel>
    </div>
  );
}
