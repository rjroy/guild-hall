import Panel from "@/components/ui/Panel";
import Link from "next/link";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={styles.container}>
      <Panel size="md">
        <h1 className={styles.heading}>This scroll could not be found.</h1>
        <p className={styles.message}>
          The artifact you seek does not exist in this hall.
        </p>
        <Link href="/" className={styles.link}>
          Return to the Guild Hall
        </Link>
      </Panel>
    </div>
  );
}
