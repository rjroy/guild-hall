---
version: 1.0.0
status: Draft
created: 2026-01-27
last_updated: 2026-01-27
authored_by:
  - Ronald Roy <gsdwig@gmail.com>
parent_spec: guild-hall.md
---

# Tool Authorization Specification

## Executive Summary

Tool Authorization provides a permission layer for worker bash commands. Workers run with elevated privileges (`--dangerously-skip-permissions` equivalent) but all tool invocations pass through a rule engine that auto-accepts safe patterns, auto-denies dangerous patterns, and escalates ambiguous commands to human review. Decisions are logged to build a corpus for future rule promotion.

This system enables autonomous task execution while containing blast radius and preventing exfiltration.

## User Story

As an operator, I want workers to execute bash commands autonomously for known-safe operations while blocking dangerous commands and asking me about ambiguous ones, so that agents can run tests and builds without exposing credentials or enabling data exfiltration.

## Stakeholders

- **Primary**: Operators (configure rules, respond to review requests, promote rules)
- **Secondary**: Workers (request tool authorization, receive decisions)

## Success Criteria

1. **Zero exfiltration**: No command capable of network exfiltration executes without human approval
2. **High autonomy**: > 95% of commands during typical task execution auto-resolve (no human needed)
3. **Learning signal**: After 1 week of operation, approval log contains actionable patterns for rule promotion
4. **Low latency**: Auto-accept/deny decisions resolve in < 100ms
5. **Review turnaround**: Human review requests notify operator within 30 seconds

## Functional Requirements

### Rule Engine

- **REQ-F-1**: System evaluates bash commands against ordered rule sets: deny rules first, then accept rules, then default to human review
- **REQ-F-2**: Rules use glob patterns for command matching (e.g., `bun test*`, `curl*`)
- **REQ-F-3**: Rules can match on:
  - Command prefix (what program is invoked)
  - Full command string (including arguments)
  - Presence of specific flags or paths
- **REQ-F-4**: Deny rules take precedence over accept rules (explicit deny cannot be overridden)
- **REQ-F-5**: Rules are scoped: global rules apply to all projects; project rules override/extend global

### Decisions

- **REQ-F-6**: Auto-accept executes the command immediately; worker continues
- **REQ-F-7**: Auto-deny returns error to worker with denial reason; worker must adapt or fail task
- **REQ-F-8**: Human review pauses worker execution until operator responds
- **REQ-F-9**: Human review requests include: full command, task context, worker ID, project ID
- **REQ-F-10**: Human review has three responses: approve (one-time), deny (one-time), approve-and-promote (adds to accept rules)
- **REQ-F-11**: Review requests timeout after configurable period (default: 15 minutes); timeout = deny

### Approval Log

- **REQ-F-12**: All authorization decisions are logged with full context
- **REQ-F-13**: Log entry includes: timestamp, worker_id, task_id, project_id, command, decision, matched_rule (if any), response_time_ms
- **REQ-F-14**: Logs are queryable by decision type, project, time range
- **REQ-F-15**: Log retention: minimum 30 days

### Rule Management

- **REQ-F-16**: Operators can add/remove/modify rules via API
- **REQ-F-17**: Rule changes take effect immediately (no restart required)
- **REQ-F-18**: System provides "dry run" mode: evaluate command against rules without executing
- **REQ-F-19**: System provides rule audit: show which commands would match a given rule

## Non-Functional Requirements

- **REQ-NF-1** (Security): Deny rules cannot be bypassed by command obfuscation (e.g., `c\url` should still match `curl`)
- **REQ-NF-2** (Security): Path-based rules resolve symlinks before matching
- **REQ-NF-3** (Observability): Metrics exposed: decisions/minute by type, average review response time, timeout rate
- **REQ-NF-4** (Reliability): Rule engine failure = deny (fail closed, not open)
- **REQ-NF-5** (Performance): Rule evaluation scales to 1000+ rules without degrading below latency target

## Explicit Constraints (DO NOT)

- Do NOT allow workers to modify authorization rules
- Do NOT execute commands while human review is pending (no "execute then ask")
- Do NOT log sensitive command arguments in plain text (redact tokens, passwords)
- Do NOT allow project rules to weaken global deny rules

## Technical Context

- **Integration**: Claude Agent SDK `onToolUse` callback intercepts bash tool invocations
- **Rule Storage**: JSON/YAML file per project + global file; watched for changes
- **Human Review Transport**: WebSocket connection to operator UI; fallback to polling
- **Pattern Matching**: Glob patterns via `picomatch` or similar; regex available for complex rules

## Default Rule Sets

### Global Deny (ships with system)

```yaml
deny:
  # Network exfiltration
  - pattern: "curl*"
    reason: "Network request - potential exfiltration"
  - pattern: "wget*"
    reason: "Network request - potential exfiltration"
  - pattern: "nc *"
    reason: "Netcat - potential exfiltration"
  - pattern: "netcat*"
    reason: "Netcat - potential exfiltration"

  # Remote access
  - pattern: "ssh *"
    reason: "Remote shell access"
  - pattern: "scp *"
    reason: "Remote file copy"
  - pattern: "rsync*"
    reason: "Remote sync"

  # Privilege escalation
  - pattern: "sudo *"
    reason: "Privilege escalation"
  - pattern: "su *"
    reason: "User switching"

  # Catastrophic deletion
  - pattern: "rm -rf /*"
    reason: "Root filesystem deletion"
  - pattern: "rm -rf ~*"
    reason: "Home directory deletion"
  - pattern: "rm -rf .*"
    reason: "Hidden file mass deletion"

  # Credential access
  - pattern: "*/.ssh/*"
    reason: "SSH credential access"
  - pattern: "*/.aws/*"
    reason: "AWS credential access"
  - pattern: "*/.config/claude/*"
    reason: "Claude config access"
  - pattern: "*/.env*"
    reason: "Environment file access"
  - pattern: "*/credentials*"
    reason: "Potential credential file"

  # Container escape
  - pattern: "docker run*-v /*"
    reason: "Docker with root mount"
  - pattern: "docker run*--privileged*"
    reason: "Privileged container"
```

### Global Accept (ships with system)

```yaml
accept:
  # Test runners
  - pattern: "bun test*"
  - pattern: "bun run test*"
  - pattern: "npm test*"
  - pattern: "npm run test*"
  - pattern: "pytest*"
  - pattern: "cargo test*"
  - pattern: "go test*"

  # Build tools
  - pattern: "bun run build*"
  - pattern: "bun run lint*"
  - pattern: "bun run typecheck*"
  - pattern: "npm run build*"
  - pattern: "npm run lint*"
  - pattern: "tsc*"
  - pattern: "eslint*"
  - pattern: "cargo build*"
  - pattern: "go build*"

  # Package management (install only)
  - pattern: "bun install"
  - pattern: "bun add *"
  - pattern: "npm install"
  - pattern: "npm ci"

  # Git (read + local write, no push)
  - pattern: "git status*"
  - pattern: "git diff*"
  - pattern: "git log*"
  - pattern: "git show*"
  - pattern: "git add*"
  - pattern: "git commit*"
  - pattern: "git branch*"
  - pattern: "git checkout*"
  - pattern: "git stash*"

  # Read-only filesystem
  - pattern: "ls*"
  - pattern: "pwd"
  - pattern: "cat *"
  - pattern: "head *"
  - pattern: "tail *"
  - pattern: "wc *"
  - pattern: "find *"
  - pattern: "grep *"
  - pattern: "rg *"
```

### Human Review (default for unmatched)

Everything not matching accept or deny rules goes to human review.

## Data Structures

### AuthorizationRule

```typescript
interface AuthorizationRule {
  id: string;
  pattern: string;
  type: 'accept' | 'deny';
  reason?: string;           // Required for deny rules
  scope: 'global' | string;  // 'global' or project_id
  created_at: string;
  created_by: string;
}
```

### AuthorizationDecision

```typescript
interface AuthorizationDecision {
  id: string;
  timestamp: string;
  worker_id: string;
  task_id: string;
  project_id: string;
  command: string;
  command_redacted: string;  // Sensitive args replaced with [REDACTED]
  decision: 'auto-accept' | 'auto-deny' | 'human-accept' | 'human-deny' | 'timeout-deny';
  matched_rule_id?: string;
  review_requested_at?: string;
  review_responded_at?: string;
  response_time_ms: number;
}
```

### HumanReviewRequest

```typescript
interface HumanReviewRequest {
  id: string;
  worker_id: string;
  task_id: string;
  project_id: string;
  command: string;
  command_redacted: string;
  context: {
    task_description: string;
    recent_commands: string[];  // Last 5 commands this worker ran
    worktree_path: string;
  };
  requested_at: string;
  expires_at: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
}
```

## Acceptance Tests

1. **Auto-accept fires**: Worker runs `bun test`; command executes without delay; log shows `auto-accept`
2. **Auto-deny blocks**: Worker runs `curl http://evil.com`; command blocked; worker receives denial reason; log shows `auto-deny`
3. **Human review flow**: Worker runs `rm -r ./temp`; operator notified; operator approves; command executes; log shows `human-accept`
4. **Review timeout**: Worker runs ambiguous command; operator does not respond for 15 minutes; command denied; worker receives timeout error
5. **Approve-and-promote**: Operator approves command with "promote" flag; command executes; new accept rule created; future identical commands auto-accept
6. **Deny precedence**: Project has accept rule for `curl localhost*`; global deny for `curl*` still blocks
7. **Obfuscation resistance**: Worker runs `cu\rl http://x.com` (escaped); still matches `curl*` deny rule
8. **Symlink resolution**: Worker runs `cat /tmp/link-to-ssh-key` where link points to `~/.ssh/id_rsa`; blocked by credential access rule
9. **Rule hot reload**: Operator adds new accept rule via API; next matching command auto-accepts without system restart
10. **Log query**: Operator queries for all `human-deny` decisions in past 24 hours; receives accurate list with full context

## Open Questions

- [ ] Should approve-and-promote require a cooldown before rule takes effect (prevent accidental broad rules)?
- [ ] Should there be a "trusted worker" mode that skips authorization for specific workers?
- [ ] How should compound commands (`cmd1 && cmd2`) be evaluated? Each separately? As a unit?

## Out of Scope

- File system sandboxing (handled by worktree isolation)
- Network sandboxing at OS level (separate concern)
- Non-bash tool authorization (v1 focuses on bash only)
- Machine learning for pattern detection (rule-based only)

---

**Next Phase**: Integrate into worker spec; define API endpoints for rule management and review transport.
