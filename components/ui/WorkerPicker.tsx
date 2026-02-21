"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import WorkerPortrait from "@/components/ui/WorkerPortrait";
import type { ChatMessage } from "@/components/meeting/types";
import styles from "./WorkerPicker.module.css";

interface WorkerInfo {
  name: string;
  displayName: string;
  displayTitle: string;
  description: string;
  portraitUrl?: string;
}

interface WorkerPickerProps {
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Parses SSE lines from a buffered response stream. Returns events parsed
 * from complete lines and the remaining incomplete buffer.
 */
function parseSSEBuffer(buffer: string): {
  events: Array<{ type: string; [key: string]: unknown }>;
  remaining: string;
} {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const lines = buffer.split("\n");
  const remaining = lines.pop()!;

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const data = JSON.parse(line.slice(6)) as {
          type: string;
          [key: string]: unknown;
        };
        events.push(data);
      } catch {
        // Malformed JSON line, skip
      }
    }
  }

  return { events, remaining };
}

let nextMessageId = 1;
function generateId(): string {
  return `wp-msg-${nextMessageId++}`;
}

/**
 * Outer wrapper that conditionally renders the modal content.
 * When isOpen transitions false to true, WorkerPickerContent mounts fresh
 * with default state, avoiding manual state resets in effects.
 */
export default function WorkerPicker({
  projectName,
  isOpen,
  onClose,
}: WorkerPickerProps) {
  if (!isOpen) return null;

  // Portal to document.body to escape parent stacking contexts created by
  // backdrop-filter on Panel and ProjectTabs components.
  return createPortal(
    <WorkerPickerContent
      projectName={projectName}
      onClose={onClose}
    />,
    document.body,
  );
}

/**
 * Inner modal content. Mounts each time the picker opens and unmounts on close,
 * so all state starts fresh without explicit resets.
 */
function WorkerPickerContent({
  projectName,
  onClose,
}: {
  projectName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [daemonOffline, setDaemonOffline] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);

  // Fetch workers on mount
  useEffect(() => {
    let cancelled = false;

    fetch("/api/workers")
      .then(async (res) => {
        if (cancelled) return;

        if (res.status === 503) {
          setDaemonOffline(true);
          setWorkers([]);
          return;
        }
        setDaemonOffline(false);

        if (!res.ok) {
          setError(`Failed to load workers (${res.status})`);
          setWorkers([]);
          return;
        }

        const data = (await res.json()) as { workers?: WorkerInfo[] };
        const list = data.workers ?? [];
        setWorkers(list);
      })
      .catch(() => {
        if (!cancelled) {
          setDaemonOffline(true);
          setWorkers([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  const handleSubmit = useCallback(async () => {
    if (!selectedWorker || !prompt.trim()) return;

    setStreaming(true);
    setError(null);

    try {
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName,
          workerName: selectedWorker,
          prompt: prompt.trim(),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const reason =
          typeof data.error === "string"
            ? data.error
            : `Request failed (${response.status})`;
        setError(reason);
        setStreaming(false);
        return;
      }

      if (!response.body) {
        setError("No response stream available");
        setStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let meetingId: string | null = null;
      const accumulatedMessages: ChatMessage[] = [];
      let accumulatedText = "";

      // Add the user's prompt as the first message
      accumulatedMessages.push({
        id: generateId(),
        role: "user",
        content: prompt.trim(),
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, remaining } = parseSSEBuffer(buffer);
        buffer = remaining;

        for (const event of events) {
          switch (event.type) {
            case "session": {
              meetingId = event.meetingId as string;
              break;
            }

            case "text_delta": {
              accumulatedText += event.text as string;
              break;
            }

            case "tool_use":
            case "tool_result": {
              // Accumulated but not displayed during the modal flow.
              // These events are stored with the messages for the chat view.
              break;
            }

            case "turn_end": {
              if (accumulatedText) {
                accumulatedMessages.push({
                  id: generateId(),
                  role: "assistant",
                  content: accumulatedText,
                });
              }

              // Store accumulated messages in sessionStorage
              if (meetingId) {
                try {
                  sessionStorage.setItem(
                    `meeting-${meetingId}-initial`,
                    JSON.stringify(accumulatedMessages),
                  );
                } catch {
                  // sessionStorage quota exceeded or unavailable, proceed without
                }

                router.push(
                  `/projects/${encodeURIComponent(projectName)}/meetings/${encodeURIComponent(meetingId)}`,
                );
              }
              break;
            }

            case "error": {
              setError(event.reason as string);
              setStreaming(false);
              return;
            }
          }
        }
      }

      // If stream ended without turn_end but we have a meetingId, navigate anyway
      if (meetingId && accumulatedMessages.length > 0) {
        try {
          sessionStorage.setItem(
            `meeting-${meetingId}-initial`,
            JSON.stringify(accumulatedMessages),
          );
        } catch {
          // sessionStorage quota exceeded or unavailable
        }
        router.push(
          `/projects/${encodeURIComponent(projectName)}/meetings/${encodeURIComponent(meetingId)}`,
        );
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Connection failed";
      setError(message);
      setStreaming(false);
    }
  }, [selectedWorker, prompt, projectName, router]);

  const canSubmit =
    selectedWorker !== null && prompt.trim().length > 0 && !streaming;

  return (
    <div
      className={styles.overlay}
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Start Audience"
    >
      <div className={styles.dialog}>
        <div className={styles.dialogContent}>
          {streaming ? (
            <div className={styles.streamingOverlay}>
              <div className={styles.spinner} aria-hidden="true" />
              <p className={styles.streamingText}>Starting audience...</p>
            </div>
          ) : (
            <>
              <h2 className={styles.title}>Start Audience</h2>

              {loading && (
                <p className={styles.statusMessage}>Loading workers...</p>
              )}

              {daemonOffline && !loading && (
                <p className={styles.errorMessage}>
                  Guild Hall daemon is not running. Start it with{" "}
                  <code>bun run dev:daemon</code>.
                </p>
              )}

              {!daemonOffline &&
                !loading &&
                workers.length === 0 &&
                !error && (
                  <p className={styles.statusMessage}>
                    No workers discovered. Add worker packages to{" "}
                    <code>~/.guild-hall/packages/</code>.
                  </p>
                )}

              {error && !daemonOffline && (
                <p className={styles.errorMessage}>{error}</p>
              )}

              {!daemonOffline && workers.length > 0 && (
                <>
                  <ul className={styles.workerList} role="listbox" aria-label="Available workers">
                    {workers.map((worker) => {
                      const isSelected = selectedWorker === worker.name;
                      const className = [
                        styles.workerItem,
                        isSelected ? styles.workerItemSelected : "",
                      ]
                        .filter(Boolean)
                        .join(" ");

                      return (
                        <li
                          key={worker.name}
                          className={className}
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => setSelectedWorker(worker.name)}
                        >
                          <WorkerPortrait
                            name={worker.displayName}
                            portraitUrl={worker.portraitUrl}
                            size="sm"
                          />
                          <div className={styles.workerInfo}>
                            <p className={styles.workerName}>{worker.displayName}</p>
                            <p className={styles.workerTitle}>
                              {worker.displayTitle}
                            </p>
                            {worker.description && (
                              <p className={styles.workerDescription}>
                                {worker.description}
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <label className={styles.promptLabel} htmlFor="audience-prompt">
                    Agenda
                  </label>
                  <textarea
                    id="audience-prompt"
                    className={styles.promptTextarea}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe what you want this worker to do..."
                  />
                </>
              )}

              <div className={styles.buttonRow}>
                <button
                  className={styles.cancelButton}
                  onClick={onClose}
                  type="button"
                >
                  Cancel
                </button>
                {!daemonOffline && workers.length > 0 && (
                  <button
                    className={styles.startButton}
                    disabled={!canSubmit}
                    onClick={() => void handleSubmit()}
                    type="button"
                  >
                    Start Audience
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
