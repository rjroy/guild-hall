"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import CommissionPrompt from "./CommissionPrompt";
import CommissionTimeline from "./CommissionTimeline";
import CommissionActions from "./CommissionActions";
import CommissionLinkedArtifacts from "./CommissionLinkedArtifacts";
import CommissionNotes from "./CommissionNotes";
import Panel from "@/components/ui/Panel";
import type { TimelineEntry } from "@/lib/commissions";
import type { CommissionArtifact } from "./CommissionLinkedArtifacts";
import styles from "./CommissionView.module.css";

interface CommissionViewProps {
  commissionId: string;
  projectName: string;
  prompt: string;
  initialStatus: string;
  initialTimeline: TimelineEntry[];
  initialArtifacts: CommissionArtifact[];
}

/**
 * Client wrapper for the commission view. Manages live SSE updates
 * from GET /api/events, filtering events by commission ID. Updates
 * status, timeline, and artifacts list in real time.
 *
 * On EventSource reconnection, triggers router.refresh() to resync
 * server-rendered state.
 */
export default function CommissionView({
  commissionId,
  projectName,
  prompt,
  initialStatus,
  initialTimeline,
  initialArtifacts,
}: CommissionViewProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [timeline, setTimeline] = useState<TimelineEntry[]>(initialTimeline);
  const [artifacts, setArtifacts] = useState<CommissionArtifact[]>(initialArtifacts);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Track whether the commission is in a live state (worth subscribing to SSE)
  const isLive = status === "dispatched" || status === "in_progress";

  useEffect(() => {
    if (!isLive) return;

    const es = new EventSource("/api/events");
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type: string;
          commissionId?: string;
          status?: string;
          from?: string;
          to?: string;
          summary?: string;
          question?: string;
          artifactPath?: string;
          timestamp?: string;
          reason?: string;
          [key: string]: unknown;
        };

        // Only process events for this commission
        if (data.commissionId !== commissionId) return;

        const ts = data.timestamp || new Date().toISOString();

        switch (data.type) {
          case "commission_status": {
            if (data.status) {
              setStatus(data.status);
            }
            if (data.from && data.to) {
              setTimeline((prev) => [
                ...prev,
                {
                  timestamp: ts,
                  event: "status_change",
                  from: data.from,
                  to: data.to,
                  reason: data.reason || "",
                } as TimelineEntry,
              ]);
            }
            break;
          }

          case "commission_progress": {
            setTimeline((prev) => [
              ...prev,
              {
                timestamp: ts,
                event: "progress_report",
                reason: data.summary || data.reason || "",
              } as TimelineEntry,
            ]);
            break;
          }

          case "commission_question": {
            setTimeline((prev) => [
              ...prev,
              {
                timestamp: ts,
                event: "question",
                reason: data.question || data.reason || "",
              } as TimelineEntry,
            ]);
            break;
          }

          case "commission_result": {
            setTimeline((prev) => [
              ...prev,
              {
                timestamp: ts,
                event: "result_submitted",
                reason: data.summary || data.reason || "",
              } as TimelineEntry,
            ]);
            break;
          }

          case "commission_artifact": {
            if (data.artifactPath) {
              const artifactPath = data.artifactPath;
              setArtifacts((prev) => {
                if (prev.some((a) => a.path === artifactPath)) return prev;
                const title =
                  artifactPath.split("/").pop()?.replace(/\.md$/, "") ||
                  artifactPath;
                return [
                  ...prev,
                  {
                    path: artifactPath,
                    title,
                    href: `/projects/${encodeURIComponent(projectName)}/artifacts/${artifactPath}`,
                  },
                ];
              });
            }
            break;
          }
        }
      } catch {
        // Malformed SSE data, skip
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects. On reconnect, refresh server state
      // to catch events we may have missed.
      if (es.readyState === EventSource.CONNECTING) {
        router.refresh();
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [isLive, commissionId, projectName, router]);

  const handleStatusChange = useCallback(
    (newStatus: string) => {
      setStatus(newStatus);
      // Refresh server-side data after a user-initiated status change
      router.refresh();
    },
    [router],
  );

  const handleNoteAdded = useCallback(() => {
    // Refresh to pick up the new timeline entry from the server
    router.refresh();
  }, [router]);

  return (
    <div className={styles.content}>
      <div className={styles.main}>
        <Panel>
          <CommissionPrompt
            prompt={prompt}
            status={status}
            commissionId={commissionId}
          />
        </Panel>

        <Panel>
          <CommissionTimeline timeline={timeline} />
        </Panel>

        <Panel size="sm">
          <CommissionNotes
            commissionId={commissionId}
            onNoteAdded={handleNoteAdded}
          />
        </Panel>
      </div>

      <div className={styles.sidebar}>
        <Panel size="sm">
          <CommissionActions
            status={status}
            commissionId={commissionId}
            onStatusChange={handleStatusChange}
          />
        </Panel>

        <Panel size="sm">
          <CommissionLinkedArtifacts
            artifacts={artifacts}
            projectName={projectName}
          />
        </Panel>
      </div>
    </div>
  );
}
