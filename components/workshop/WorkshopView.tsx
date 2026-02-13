"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";

import { useSSE } from "@/hooks/useSSE";
import { useWorkshopSession } from "@/hooks/useWorkshopSession";
import { RosterPanel } from "@/components/roster/RosterPanel";
import { ConversationHistory } from "./ConversationHistory";
import { MessageInput } from "./MessageInput";
import { ProcessingIndicator } from "./ProcessingIndicator";
import styles from "./WorkshopView.module.css";

type WorkshopViewProps = {
  sessionId: string;
};

export function WorkshopView({ sessionId }: WorkshopViewProps) {
  const {
    session,
    loading,
    error,
    streamingText,
    pendingToolCalls,
    status,
    sseUrl,
    fetchSession,
    sendMessage,
    stopQuery,
    handleSSEEvent,
  } = useWorkshopSession(sessionId);

  // Connect SSE only after server confirms query is running (POST 202),
  // or when loading a session that's already running.
  useSSE(sseUrl, handleSSEEvent);

  useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  const handleSendMessage = useCallback(
    (content: string) => {
      void sendMessage(content);
    },
    [sendMessage],
  );

  const handleStopQuery = useCallback(() => {
    void stopQuery();
  }, [stopQuery]);

  const handleResume = useCallback(() => {
    void sendMessage("[Session resumed by user]");
  }, [sendMessage]);

  // Loading state
  if (loading) {
    return (
      <div className={styles.layout}>
        <div className={styles.centered}>
          <span className={styles.loadingText}>
            Loading session
            <span className={styles.loadingDots}>...</span>
          </span>
        </div>
      </div>
    );
  }

  // Error state (including 404)
  if (error && !session) {
    const isNotFound = error === "Session not found";
    return (
      <div className={styles.layout}>
        <div className={styles.centered}>
          <div className={styles.errorCard}>
            <p className={styles.errorTitle}>
              {isNotFound ? "Session Not Found" : "Failed to Load Session"}
            </p>
            <p className={styles.errorMessage}>{error}</p>
            <div className={styles.errorActions}>
              {!isNotFound && (
                <button
                  className={styles.retryButton}
                  onClick={() => void fetchSession()}
                >
                  Retry
                </button>
              )}
              <Link href="/" className={styles.backLink}>
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <RosterPanel />
      </aside>

      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <Link href="/" className={styles.breadcrumbLink}>
              Guild Hall
            </Link>
            <span className={styles.breadcrumbSep}>/</span>
            <h1 className={styles.sessionName}>{session.metadata.name}</h1>
          </div>
          <div className={styles.headerMeta}>
            {session.metadata.guildMembers.map((member) => (
              <span key={member} className={styles.memberChip}>
                {member}
              </span>
            ))}
            <span className={styles.statusBadge} data-status={status}>
              {status}
            </span>
          </div>
        </header>

        {status === "expired" && (
          <div className={styles.expiredBanner}>
            <p className={styles.expiredText}>
              This session has expired. The agent&apos;s conversation history
              has been lost, but your context file is preserved.
            </p>
            <button
              className={styles.resumeButton}
              onClick={handleResume}
              type="button"
            >
              Start Fresh
            </button>
          </div>
        )}

        {error && (
          <div className={styles.inlineError}>
            <p className={styles.inlineErrorText}>{error}</p>
          </div>
        )}

        <ConversationHistory
          messages={session.messages}
          streamingText={streamingText}
          pendingToolCalls={pendingToolCalls}
        />

        {status === "running" && (
          <ProcessingIndicator onStop={handleStopQuery} />
        )}

        <MessageInput
          disabled={status === "running"}
          onSend={handleSendMessage}
        />
      </div>
    </div>
  );
}
