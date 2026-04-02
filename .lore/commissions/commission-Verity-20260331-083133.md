---
title: "Commission: Research: Environment and host configuration for dangerous allow modes"
date: 2026-03-31
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research the operational and security implications of giving AI agents full computer access, specifically in the context of configuring the host environment where they run.\n\n## Context\n\nGuild Hall is a multi-agent workspace where AI workers (Claude via the Claude Agent SDK) execute commissions. We're designing two environment variables:\n- `ENABLE_DANGEROUSLY_ALLOW` — removes all permission/sandbox restrictions from AI sessions\n- `ENABLE_DANGEROUSLY_TOOLS` — gives every worker access to every tool (bash, file write, etc.)\n\nCombined, these give the AI unrestricted access to the machine and its resources. The user is now asking: what does this mean for how you configure the PC and environment this runs on? Specifically, should the AI get its own GitHub account?\n\n## Research questions\n\n1. **GitHub accounts and credentials**\n   - Should AI agents have their own GitHub account vs. using the human's account?\n   - What are the implications of each? (audit trail, permissions, rate limits, liability if the AI pushes something bad)\n   - How do organizations typically handle this? (bot accounts, GitHub Apps, fine-grained PATs)\n   - What's GitHub's ToS position on automated/bot accounts?\n\n2. **System user isolation**\n   - Should the AI run under its own OS user account rather than the human's?\n   - What does this buy you? (file permission boundaries, process isolation, credential separation)\n   - What are the tradeoffs? (complexity, shared project access)\n\n3. **Credential and secret management**\n   - When the AI has full bash access, it can read ~/.ssh, ~/.gitconfig, environment variables, keychain, browser cookies, etc.\n   - What credentials should be isolated or removed from the environment?\n   - How do teams typically scope credentials for automated agents? (short-lived tokens, dedicated service accounts, vault-based secret injection)\n\n4. **Network and resource boundaries**\n   - Should the AI's network access be restricted even when tool access is open? (firewall rules, proxy, DNS filtering)\n   - What about access to cloud provider credentials (AWS, GCP, etc.)?\n   - Container/VM isolation vs. bare metal — what's the practical tradeoff for a single-developer setup?\n\n5. **Audit and rollback**\n   - What logging should be in place when the AI has full access?\n   - Git reflog, shell history, filesystem snapshots — what's practical?\n   - How do you roll back if the AI does something destructive?\n\n6. **Industry practice**\n   - How do other agent frameworks (Devin, SWE-agent, OpenHands, Cursor, etc.) handle this?\n   - What isolation patterns exist in the wild?\n   - Are there established best-practice guides for \"AI agent host hardening\"?\n\n## Output\n\nWrite the research findings to `.lore/research/dangerous-mode-environment-config.md` with YAML frontmatter. Organize by topic area. Include specific, actionable recommendations where the research supports them. Cite sources where possible (URLs to docs, blog posts, GitHub discussions).\n\nThe audience is a senior engineering manager deciding how to configure his personal development machine. Practical over theoretical. Name the tradeoffs honestly."
dependencies: []
linked_artifacts:
  - .lore/research/dangerous-mode-environment-config.md

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-03-31T15:31:33.946Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-31T15:31:33.948Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-31T15:31:34.084Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-31T15:31:41.689Z
    event: progress_report
    reason: "Starting research. Checking .lore/research/ for existing relevant artifacts, then gathering external sources on AI agent isolation, GitHub bot accounts, credential management, and host hardening."
  - timestamp: 2026-03-31T15:32:16.339Z
    event: progress_report
    reason: "Gathered primary sources across all six research areas. Fetching specific pages for deeper detail on key topics before synthesizing."
  - timestamp: 2026-03-31T15:32:47.706Z
    event: progress_report
    reason: "Deep-dived into Claude Code permissions docs, Anthropic's secure deployment guide, NVIDIA sandboxing guide, and Pillar Security's agent risk analysis. Now synthesizing all findings into the research artifact."
  - timestamp: 2026-03-31T15:35:30.755Z
    event: result_submitted
    reason: "Research complete. Wrote `.lore/research/dangerous-mode-environment-config.md` covering all six research areas:\n\n1. **GitHub accounts**: Dedicated machine account is the clear winner. GitHub ToS explicitly permits one free machine account per human. Fine-grained PAT scoped to specific repos provides the right balance of security and simplicity for a solo setup. GitHub Apps are better security (short-lived tokens) but higher setup cost.\n\n2. **System user isolation**: A separate OS user provides real credential separation but adds friction for shared project access. For a personal dev machine, credential isolation (Section 3) without a separate user is the pragmatic choice. Separate user makes more sense in multi-tenant setups.\n\n3. **Credential management**: Highest-impact area. Full bash access exposes everything the process owner can read: SSH keys, cloud credentials, browser state, shell history. Three-tier strategy: remove cloud creds entirely, scope git/SSH to bot account, accept project .env exposure with logging.\n\n4. **Network boundaries**: Even with full tool access, network egress controls prevent the worst outcomes. Proxy with domain allowlist (Anthropic API, GitHub, package registries) is the practical sweet spot. Docker `--network none` plus proxy socket for maximum control.\n\n5. **Audit and rollback**: Git reflog (90 days), filesystem snapshots (Btrfs/ZFS), and subprocess output capture. Commission system provides natural audit trail. Take a snapshot before dangerous-mode sessions.\n\n6. **Industry practice**: Every serious framework uses container or VM isolation. Claude Code's own docs say `bypassPermissions` should only be used in containers/VMs. The proxy pattern (credentials injected outside agent boundary) is the universal recommendation across Anthropic, OpenAI, and open-source frameworks.\n\nKey finding not in the original questions: prompt injection via project files is outside the scope of host hardening. A malicious README can influence agent behavior regardless of environment configuration. That's a model-level concern, not an ops one."
  - timestamp: 2026-03-31T15:35:33.918Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Deep-dived into Claude Code permissions docs, Anthropic's secure deployment guide, NVIDIA sandboxing guide, and Pillar Security's agent risk analysis. Now synthesizing all findings into the research artifact."
projectName: guild-hall
---
Research complete. Wrote `.lore/research/dangerous-mode-environment-config.md` covering all six research areas:

1. **GitHub accounts**: Dedicated machine account is the clear winner. GitHub ToS explicitly permits one free machine account per human. Fine-grained PAT scoped to specific repos provides the right balance of security and simplicity for a solo setup. GitHub Apps are better security (short-lived tokens) but higher setup cost.

2. **System user isolation**: A separate OS user provides real credential separation but adds friction for shared project access. For a personal dev machine, credential isolation (Section 3) without a separate user is the pragmatic choice. Separate user makes more sense in multi-tenant setups.

3. **Credential management**: Highest-impact area. Full bash access exposes everything the process owner can read: SSH keys, cloud credentials, browser state, shell history. Three-tier strategy: remove cloud creds entirely, scope git/SSH to bot account, accept project .env exposure with logging.

4. **Network boundaries**: Even with full tool access, network egress controls prevent the worst outcomes. Proxy with domain allowlist (Anthropic API, GitHub, package registries) is the practical sweet spot. Docker `--network none` plus proxy socket for maximum control.

5. **Audit and rollback**: Git reflog (90 days), filesystem snapshots (Btrfs/ZFS), and subprocess output capture. Commission system provides natural audit trail. Take a snapshot before dangerous-mode sessions.

6. **Industry practice**: Every serious framework uses container or VM isolation. Claude Code's own docs say `bypassPermissions` should only be used in containers/VMs. The proxy pattern (credentials injected outside agent boundary) is the universal recommendation across Anthropic, OpenAI, and open-source frameworks.

Key finding not in the original questions: prompt injection via project files is outside the scope of host hardening. A malicious README can influence agent behavior regardless of environment configuration. That's a model-level concern, not an ops one.
