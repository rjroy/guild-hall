import Link from "next/link";
import { formatTimestamp } from "./format-timestamp";
import styles from "./TriggerInfo.module.css";

export interface TriggerInfoData {
  match: {
    type: string;
    projectName?: string;
    fields?: Record<string, string>;
  };
  approval: string;
  maxDepth: number;
  runsCompleted: number;
  lastTriggered: string | null;
  lastSpawnedId: string | null;
  recentSpawns: Array<{
    commissionId: string;
    status: string;
    date: string;
  }>;
}

interface TriggerInfoProps {
  trigger: TriggerInfoData;
  projectName: string;
}

/**
 * Displays trigger metadata for a triggered commission: match rule,
 * approval mode, depth limit, run count, and recent spawned commissions.
 */
export default function TriggerInfo({
  trigger,
  projectName,
}: TriggerInfoProps) {
  const lastTriggeredDisplay = trigger.lastTriggered
    ? formatTimestamp(trigger.lastTriggered)
    : "Never";

  const fields = trigger.match.fields;
  const hasFields = fields && Object.keys(fields).length > 0;

  return (
    <div className={styles.container}>
      <h3 className={styles.label}>Trigger</h3>

      <dl className={styles.fields}>
        <div className={styles.field}>
          <dt className={styles.fieldLabel}>Event</dt>
          <dd className={styles.fieldValue}>
            <code className={styles.eventType}>{trigger.match.type}</code>
          </dd>
        </div>

        {trigger.match.projectName && (
          <div className={styles.field}>
            <dt className={styles.fieldLabel}>Project</dt>
            <dd className={styles.fieldValue}>{trigger.match.projectName}</dd>
          </div>
        )}

        {hasFields && (
          <div className={styles.field}>
            <dt className={styles.fieldLabel}>Fields</dt>
            <dd className={styles.fieldValue}>
              {Object.entries(fields).map(([key, pattern]) => (
                <span key={key} className={styles.matchField}>
                  {key}: <code>{pattern}</code>
                </span>
              ))}
            </dd>
          </div>
        )}

        <div className={styles.field}>
          <dt className={styles.fieldLabel}>Approval</dt>
          <dd className={`${styles.fieldValue} ${trigger.approval === "auto" ? styles.approvalAuto : ""}`}>
            {trigger.approval}
          </dd>
        </div>

        <div className={styles.field}>
          <dt className={styles.fieldLabel}>Max depth</dt>
          <dd className={styles.fieldValue}>{trigger.maxDepth}</dd>
        </div>

        <div className={styles.field}>
          <dt className={styles.fieldLabel}>Runs</dt>
          <dd className={styles.fieldValue}>{trigger.runsCompleted}</dd>
        </div>

        <div className={styles.field}>
          <dt className={styles.fieldLabel}>Last triggered</dt>
          <dd className={styles.fieldValue}>{lastTriggeredDisplay}</dd>
        </div>

        <div className={styles.field}>
          <dt className={styles.fieldLabel}>Last spawned</dt>
          <dd className={styles.fieldValue}>
            {trigger.lastSpawnedId ? (
              <Link
                href={`/projects/${encodeURIComponent(projectName)}/commissions/${encodeURIComponent(trigger.lastSpawnedId)}`}
                className={styles.spawnLink}
              >
                {trigger.lastSpawnedId}
              </Link>
            ) : (
              "None"
            )}
          </dd>
        </div>
      </dl>

      {trigger.recentSpawns.length > 0 && (
        <div className={styles.recentSpawns}>
          <h4 className={styles.recentSpawnsLabel}>Recent Spawns</h4>
          <ul className={styles.spawnList}>
            {trigger.recentSpawns.map((spawn) => (
              <li key={spawn.commissionId} className={styles.spawnItem}>
                <Link
                  href={`/projects/${encodeURIComponent(projectName)}/commissions/${encodeURIComponent(spawn.commissionId)}`}
                  className={styles.spawnItemLink}
                >
                  <span className={styles.spawnId}>{spawn.commissionId}</span>
                  <span className={styles.spawnMeta}>
                    <span className={`${styles.spawnStatus} ${styles[`status_${spawn.status}`] ?? ""}`}>
                      {spawn.status}
                    </span>
                    <span className={styles.spawnDate}>{formatTimestamp(spawn.date)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
