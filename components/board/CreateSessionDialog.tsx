"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  CreateSessionRequest,
  GuildMember,
  RosterResponse,
  SessionMetadata,
} from "@/lib/types";
import {
  buildCreateSessionBody,
  canSubmitSession,
  toggleSetMember,
} from "@/lib/board-utils";
import styles from "./CreateSessionDialog.module.css";

type CreateSessionDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (session: SessionMetadata) => void;
};

type RosterState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; members: GuildMember[] };

export function CreateSessionDialog({
  open,
  onClose,
  onCreated,
}: CreateSessionDialogProps) {
  const [name, setName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [roster, setRoster] = useState<RosterState>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoster = useCallback(async () => {
    setRoster({ status: "loading" });
    try {
      const response = await fetch("/api/roster");
      if (!response.ok) {
        throw new Error(`Failed to fetch roster (${response.status})`);
      }
      const members = (await response.json()) as RosterResponse;
      setRoster({ status: "loaded", members });
    } catch (err) {
      setRoster({
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, []);

  // Fetch roster when dialog opens
  useEffect(() => {
    if (open) {
      void fetchRoster();
      // Reset form state
      setName("");
      setSelectedMembers(new Set());
      setError(null);
    }
  }, [open, fetchRoster]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const toggleMember = (memberName: string) => {
    setSelectedMembers((prev) => toggleSetMember(prev, memberName));
  };

  const canSubmit = canSubmitSession(name, selectedMembers.size, creating);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setCreating(true);
    setError(null);

    try {
      const body: CreateSessionRequest = buildCreateSessionBody(
        name,
        selectedMembers,
      );

      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          errorData?.error ?? `Failed to create session (${response.status})`,
        );
      }

      const session = (await response.json()) as SessionMetadata;
      onCreated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        // Close when clicking backdrop, not dialog content
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Phase I: no focus trap. Consider native <dialog> or a focus-trap library for Phase II. */}
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="create-session-title">
        <div className={styles.header}>
          <span id="create-session-title" className={styles.headerTitle}>New Session</span>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close dialog"
          >
            &#10005;
          </button>
        </div>

        <div className={styles.body}>
          {error && <div className={styles.errorMessage}>{error}</div>}

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="session-name">
              Session Name
            </label>
            <input
              id="session-name"
              className={styles.nameInput}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Debug auth flow"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) void handleSubmit();
              }}
            />
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.label}>Guild Members</span>
            {selectedMembers.size === 0 && (
              <p className={styles.validationHint}>
                Select at least one guild member
              </p>
            )}

            {roster.status === "loading" && (
              <p className={styles.membersLoading}>Loading roster...</p>
            )}

            {roster.status === "error" && (
              <div className={styles.membersError}>{roster.message}</div>
            )}

            {roster.status === "loaded" && (
              <div className={styles.memberList}>
                {roster.members.map((member) => (
                  <label key={member.name} className={styles.memberOption}>
                    <input
                      type="checkbox"
                      className={styles.memberCheckbox}
                      checked={selectedMembers.has(member.name)}
                      onChange={() => toggleMember(member.name)}
                    />
                    <div className={styles.memberInfo}>
                      <div className={styles.memberName}>
                        {member.displayName}
                      </div>
                      {member.description && (
                        <div className={styles.memberDescription}>
                          {member.description}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button
            className={styles.createButton}
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            {creating ? "Creating..." : "Create Session"}
          </button>
        </div>
      </div>
    </div>
  );
}
