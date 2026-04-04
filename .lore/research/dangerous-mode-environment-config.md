---
title: "Dangerous Mode Environment Configuration: Host Hardening for Unrestricted AI Agents"
date: 2026-03-31
status: parked
tags: [security, environment, configuration, agents, dangerous-mode]
related:
  - .lore/specs/infrastructure/daemon-application-boundary.md
---

# Dangerous Mode Environment Configuration

Research conducted March 2026. Covers the operational and security implications of giving AI agents unrestricted access to a host machine, with specific focus on GitHub accounts, OS-level isolation, credential management, network boundaries, audit/rollback, and industry practice.

Context: Guild Hall's `ENABLE_DANGEROUSLY_ALLOW` (removes permission/sandbox restrictions) and `ENABLE_DANGEROUSLY_TOOLS` (gives every worker every tool) together produce an AI agent with full access to the machine. This research addresses how to configure the host environment to make that viable.

Audience: Senior engineering manager configuring a personal development machine.

---

## 1. GitHub Accounts and Credentials

### Should the AI get its own GitHub account?

**Yes.** The case is strong enough that this should be treated as a default, not an option.

Three approaches exist, ranked by how well they serve a single-developer setup:

| Approach | Audit trail | Permission scoping | Operational cost | Best for |
|----------|-------------|-------------------|------------------|----------|
| Dedicated machine account + fine-grained PAT | Commits attributed to bot, PRs show bot as author | Repository-scoped, read/write per-repo | One-time setup, token rotation | **Single developer (recommended)** |
| GitHub App (self-hosted) | Commits attributed to app bot, installation-scoped | Fine-grained per-installation, short-lived tokens | Higher setup, auto-rotating tokens | Teams, multi-repo automation |
| Human's personal account + PAT | Commits look like the human made them | Whatever the human has | Zero setup | Quick experiments only |

### GitHub ToS position

GitHub's Terms of Service (Section B.3) explicitly permit "machine accounts" under these conditions:

- A human must create the account and accept ToS on its behalf
- A valid email address is required
- The human owner bears full responsibility for the machine's actions
- One free machine account is permitted per human, in addition to the human's personal account

Machine accounts are not "bot accounts" (which are prohibited from self-registration). A human creates it, names it something like `rjroy-guild-hall-bot`, and uses it exclusively for automated tasks. This is within policy.

**Source:** [GitHub Terms of Service, Section B.3](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service)

### Practical setup for a dedicated machine account

1. Create a new GitHub account with a clear bot name (e.g., `rjroy-automation`)
2. Add it as a collaborator to relevant repos (write access only where needed)
3. Generate a fine-grained PAT scoped to specific repositories with only the permissions required (typically: contents read/write, pull requests read/write, metadata read)
4. Configure `.gitconfig` in the agent's environment with the bot account's name and email
5. Store the PAT where only the agent's process can read it (not in `~/.gitconfig`, not in env vars visible to all processes)

**Why not the human's account:** When the AI pushes a commit, it looks identical to a human commit. If the AI introduces a bug, pushes to the wrong branch, or opens a PR with generated content, the audit trail doesn't distinguish human from machine. With a dedicated account, `git log --author` immediately separates human and machine work.

**Why not a GitHub App for a solo setup:** GitHub Apps provide short-lived installation tokens (1-hour expiry) that auto-rotate, which is genuinely better security. But the setup cost is higher (create the app, generate a private key, write token-refresh logic). For a single developer on personal repos, a fine-grained PAT with 90-day expiry on a dedicated machine account is the practical sweet spot. Upgrade to a GitHub App if the agent starts operating across multiple repos or organizations.

**Rate limits:** Fine-grained PATs get 5,000 requests/hour per authenticated user. A dedicated account means the agent's API calls don't count against the human's quota. GitHub Apps get higher limits that scale with org size.

**Sources:**
- [GitHub: Types of accounts](https://docs.github.com/en/get-started/learning-about-github/types-of-github-accounts)
- [GitHub: Managing personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
- [GitHub: Deciding when to build a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app)
- [GitHub Community: Bot account guidance](https://github.com/orgs/community/discussions/169685)

---

## 2. System User Isolation

### Should the AI run under its own OS user?

**For a personal dev machine: probably not, but understand the tradeoff.**

Running the agent as a separate Linux user provides:

- **File permission boundaries:** The agent can't read `~/.ssh/id_ed25519`, `~/.aws/credentials`, browser profiles, or anything else in the human's home directory (unless explicitly granted via group permissions or ACLs)
- **Process isolation:** Signals, ptrace, `/proc` access restricted between users
- **Credential separation:** Keyrings, SSH agents, and per-user credential stores become naturally isolated
- **Audit clarity:** `ps aux`, syslog, and filesystem ownership clearly show which user did what

The cost:

- **Shared project access gets complicated.** The agent needs to read and write project files the human also works on. Options: shared group with appropriate umask, bind mounts, or ACLs. All add friction.
- **Tool configuration duplication.** The agent user needs its own `.gitconfig`, shell config, tool installations, or access to the human's via read-only mounts.
- **Session management.** Starting the agent requires `su`, `sudo -u`, or a service manager. Interactive debugging becomes awkward.

**Verified claim:** Linux user isolation is a real security boundary. Different UIDs cannot read each other's files (assuming default permissions), cannot send signals to each other's processes, and cannot access each other's credential stores. This is how multi-user systems have worked for decades.

**Inferred assessment:** For a single-developer setup where the human is the only person on the machine, the complexity cost of a separate user often exceeds the security benefit, especially when the bigger risk (unrestricted bash) can be mitigated by credential isolation alone (see Section 3). A dedicated user makes more sense in multi-tenant or production environments.

**What I'd do instead for a solo setup:** Keep the same user, but isolate credentials (Section 3) and use container-based isolation for higher-risk operations.

**Source:** [Kicksecure: Strong Linux User Account Isolation](https://www.kicksecure.com/wiki/Dev/Strong_Linux_User_Account_Isolation)

---

## 3. Credential and Secret Management

This is the highest-impact section. When `ENABLE_DANGEROUSLY_TOOLS` gives the agent unrestricted bash, it can read anything the process owner can read.

### What's exposed

Everything in the user's home directory and environment:

| Credential | Location | Risk if accessed |
|-----------|----------|-----------------|
| SSH private keys | `~/.ssh/` | Push to any repo, SSH to any server |
| AWS credentials | `~/.aws/credentials`, env vars | Full cloud account access |
| GCP credentials | `~/.config/gcloud/` | Full cloud project access |
| Azure credentials | `~/.azure/` | Full Azure subscription access |
| Docker registry auth | `~/.docker/config.json` | Push images to registries |
| Kubernetes config | `~/.kube/config` | Cluster admin access |
| Browser cookies/sessions | `~/.config/chromium/`, `~/.mozilla/` | Authenticated sessions to any site |
| GPG private keys | `~/.gnupg/` | Sign commits, decrypt messages |
| Password manager vaults | varies | Everything |
| Shell history | `~/.bash_history`, `~/.zsh_history` | Leaked commands containing secrets |
| Git credentials | `~/.git-credentials` | Plaintext tokens |
| npm/PyPI tokens | `~/.npmrc`, `~/.pypirc` | Publish packages |
| Environment variables | `env`, `/proc/self/environ` | API keys, tokens, connection strings |

### Isolation strategy (practical, not theoretical)

**Tier 1: Remove from the environment entirely.** These credentials should not exist where the agent can reach them.

- Cloud provider credentials (AWS, GCP, Azure). Use short-lived tokens injected per-session via a credential broker, or move cloud work to a different machine/VM entirely.
- Browser profiles. The agent has no business reading browser state. If running as the same user, this is hard to prevent without a separate user or container.
- Password manager vaults. If using a CLI-based vault (1Password CLI, Bitwarden CLI), don't leave sessions unlocked in the agent's environment.

**Tier 2: Scope narrowly.** These credentials may be needed but should be minimal.

- SSH keys: Generate a dedicated key pair for the agent. Add it only to repos the agent should access (via the bot GitHub account). Don't give it the human's keys.
- Git credentials: The bot account's fine-grained PAT, stored in a credential helper with limited scope. Not the human's credential store.
- npm/PyPI tokens: Read-only if the agent only needs to install. Don't give publish tokens unless specifically needed.

**Tier 3: Accept the risk with logging.** These are hard to isolate without breaking functionality.

- Project `.env` files: The agent often needs these to run/test the code. Treat them as exposed and keep them scoped (dev-only credentials, not production).
- Shell history: If the agent runs in the human's shell, history will intermingle. Consider disabling history for agent sessions (`HISTFILE=/dev/null`).

### The proxy pattern

Anthropic's own secure deployment guide recommends running a credential-injecting proxy outside the agent's boundary. The agent sends unauthenticated requests; the proxy adds credentials before forwarding. The agent never sees the actual tokens.

This is the gold standard for production. For a personal dev machine, it's worth considering for cloud credentials but may be overengineered for git access (where a scoped PAT on a bot account is sufficient).

**Emerging tooling:** [VaultAgent](https://www.vaultagent.io/) and 1Password's agentic AI SDK are purpose-built for this pattern, providing just-in-time credential injection without exposing secrets to the agent process.

**Sources:**
- [Anthropic: Securely deploying AI agents](https://platform.claude.com/docs/en/agent-sdk/secure-deployment)
- [Brian Gershon: Securing AI Coding Tools](https://www.briangershon.com/blog/securing-ai-coding-tools/)
- [1Password: Agentic AI security](https://1password.com/solutions/agentic-ai)

---

## 4. Network and Resource Boundaries

### Should network access be restricted even with open tool access?

**Yes, and this is where the most practical protection comes from.**

Even with full bash access, network egress controls prevent the worst outcomes: data exfiltration, unauthorized API calls, and supply-chain attacks (downloading malicious packages).

### Options for a personal dev machine

| Approach | Complexity | Protection level | Tradeoff |
|----------|-----------|-----------------|----------|
| No restrictions | Zero | None | Agent can reach anything |
| DNS filtering (Pi-hole, NextDNS) | Low | Blocks known-bad domains | Easy to bypass with IP addresses |
| Proxy with domain allowlist | Medium | Agent can only reach listed domains | Must maintain allowlist |
| Container with `--network none` + proxy socket | Medium-High | Agent has zero network unless through proxy | Requires container setup |
| Firewall rules (iptables/nftables) per-user | Medium | OS-enforced, per-UID restrictions | Requires separate user or cgroup |
| VM isolation | High | Complete network separation | Highest overhead |

**For Guild Hall's use case:** The Claude Agent SDK already makes API calls to Anthropic's endpoints. The agent needs network access for: (1) Anthropic API, (2) GitHub (push/pull), (3) package registries (npm, PyPI). Everything else is optional.

A proxy with an allowlist of these three categories would catch the most dangerous scenarios (exfiltration to arbitrary endpoints) while allowing normal development workflow.

### Cloud provider credentials

**Keep cloud credentials off the machine entirely if possible.** AWS, GCP, and Azure CLIs all support SSO-based auth with short-lived session tokens. If the agent doesn't need cloud access (and for Guild Hall it likely doesn't), don't configure cloud CLIs on the machine at all.

If cloud access is needed, use a credential broker that provides per-session, time-limited tokens with minimal IAM permissions.

### Container vs. VM vs. bare metal

| Isolation | Startup | Overhead | Security boundary | Practical for solo dev? |
|-----------|---------|----------|-------------------|------------------------|
| Bare metal (same user) | Instant | None | None | Yes, with credential isolation |
| Container (Docker) | Seconds | Low | Namespace isolation, shared kernel | Yes, good balance |
| Container + gVisor | Seconds | Medium-High (I/O penalty) | Intercepted syscalls | Maybe, if processing untrusted code |
| Firecracker microVM | ~125ms | Medium | Separate kernel | Overkill for personal use |
| Full VM (QEMU/VirtualBox) | Minutes | High | Complete isolation | Only if multi-tenant |

**Verified:** Containers share the host kernel. A kernel exploit from inside a container can reach the host. For an AI agent that executes arbitrary code by design, this is a real (if unlikely) concern. gVisor and Firecracker address this at the cost of I/O performance and setup complexity.

**Inferred:** For a personal dev machine running your own code (not untrusted third-party repos), Docker with `--cap-drop ALL --security-opt no-new-privileges` is sufficient. The realistic threat is the agent doing something unintended (deleting files, pushing to the wrong branch), not a sophisticated kernel exploit.

**Sources:**
- [NVIDIA: Practical Security Guidance for Sandboxing Agentic Workflows](https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk/)
- [Anthropic: Securely deploying AI agents](https://platform.claude.com/docs/en/agent-sdk/secure-deployment)

---

## 5. Audit and Rollback

### What logging should be in place?

When the agent has full access, you need to reconstruct what happened after the fact. Three layers:

**Git layer (most important for code work):**
- Git reflog survives for 90 days by default. It records every HEAD movement, including resets and force-pushes. This is your primary recovery mechanism for code changes.
- Pre-push hooks can prevent force-pushes to protected branches.
- If the agent uses a dedicated bot account, `git log --author=bot` gives you a complete history of machine-made changes.
- Guild Hall's commission system already provides a natural audit trail: each commission is a bounded unit of work with a defined scope.

**Shell/process layer:**
- `script` or `ttyrec` can record full terminal sessions if running interactively.
- For programmatic execution, capture all subprocess stdout/stderr to log files.
- Guild Hall's Agent SDK sessions already capture tool calls and results in the conversation transcript.
- Consider enabling `auditd` for file access logging on sensitive paths.

**Filesystem layer:**
- Btrfs/ZFS snapshots before agent sessions provide point-in-time recovery.
- On ext4, `timeshift` or manual `rsync` snapshots serve the same purpose with more overhead.
- For containers, the ephemeral filesystem is itself a form of protection: destroy the container and changes disappear.

### Rollback strategies

| Scenario | Recovery mechanism | Confidence |
|----------|-------------------|------------|
| Bad commits pushed | `git revert` or `git reset` + force-push (own repos only) | High |
| Files deleted outside git | Filesystem snapshots (Btrfs/ZFS) or backups | High if snapshots exist |
| Wrong branch pushed to | Git reflog + reset | High |
| Credentials exposed in commit | Rotate credentials immediately, `git filter-branch` or BFG | Medium (rotation is the real fix) |
| System config modified | Config management (Nix, Ansible) or snapshots | Depends on setup |
| Package published | Unpublish within 72 hours (npm) or contact registry | Low to medium |

**Practical recommendation:** Take a Btrfs/ZFS snapshot before any "dangerous mode" session. It's cheap (copy-on-write), fast, and gives you a guaranteed rollback point for the entire filesystem state. If you're on ext4, at minimum `git stash && git log --oneline -5` before the agent starts working.

**Source:** [Refact.ai: Agent Rollback](https://docs.refact.ai/features/autonomous-agent/rollback/)

---

## 6. Industry Practice

### How do other agent frameworks handle this?

| Framework | Default isolation | Network | Credentials | Notes |
|-----------|------------------|---------|-------------|-------|
| **OpenAI Codex (cloud)** | Container per task, destroyed after | Offline during agent phase; setup phase has network | Secrets encrypted, removed before agent phase | Two-phase model: setup (online) then agent (offline) |
| **OpenAI Codex (local)** | Landlock + seccomp sandbox by default | Restricted | Workspace-scoped | Only major agent with default-on sandboxing |
| **Claude Code** | Permission system + optional sandbox | Configurable via sandbox + proxy | Configurable via permission rules | Most flexible; `bypassPermissions` mode warns to use in containers/VMs |
| **Devin** | Cloud VM per session | Restricted | Managed by Cognition | Fully managed environment |
| **OpenHands** | Docker container (cap-drop ALL, no-new-privileges) | Configurable | Workspace mounting only | Open-source, good security defaults |
| **Cursor** | Runs in editor process (no isolation) | Full | Full access to user's environment | Privacy Mode prevents code retention |
| **SWE-agent** | Docker container | Configurable | Via environment variables | Research-oriented |

**Key pattern:** Every framework that takes security seriously uses some form of container or VM isolation. The ones that don't (Cursor, GitHub Copilot in-editor) compensate by limiting what the agent can do (no arbitrary bash). When you remove both constraints (full access + no sandbox), you're in territory that none of the major frameworks recommend.

### Claude Code's own guidance

Anthropic's documentation is explicit: `bypassPermissions` mode should "only be used in isolated environments like containers or VMs where Claude Code cannot cause damage." Their secure deployment guide provides detailed Docker, gVisor, and Firecracker configurations with specific hardening flags.

The recommended architecture is: agent runs inside a container/VM, communicates through a proxy that handles credentials and network filtering. This is exactly the pattern Codex, Devin, and OpenHands also use.

**Sources:**
- [Claude Code: Configure permissions](https://code.claude.com/docs/en/permissions)
- [Anthropic: Securely deploying AI agents](https://platform.claude.com/docs/en/agent-sdk/secure-deployment)
- [OpenAI: Introducing Codex](https://openai.com/index/introducing-codex/)
- [OpenAI: Codex Security](https://developers.openai.com/codex/security)
- [OpenHands: Docker Sandbox](https://docs.openhands.dev/sdk/guides/agent-server/docker-sandbox)
- [Pillar Security: Hidden Security Risks of SWE Agents](https://www.pillar.security/blog/the-hidden-security-risks-of-swe-agents-like-openai-codex-and-devin-ai)

### The IDEsaster findings

In December 2025, security researchers found over 30 vulnerabilities across major AI coding platforms, resulting in 24 CVEs. The recommendation from that research: treat AI agents as untrusted third parties with the same controls applied to external contractors: least privilege, mandatory code review, audit logging, and strict data access restrictions.

**Source:** [Knostic: AI Coding Agent Security](https://www.knostic.ai/blog/ai-coding-agent-security)

---

## Summary: Configuration Checklist for a Personal Dev Machine

This is not a recommendation. These are the options the research supports, organized by effort and impact.

### Minimum viable (do this regardless)

- [ ] Dedicated GitHub machine account with fine-grained PAT scoped to specific repos
- [ ] Dedicated SSH key pair for the agent, added only to the bot account
- [ ] Remove or don't configure cloud provider credentials (AWS/GCP/Azure) on the machine unless needed
- [ ] `HISTFILE=/dev/null` for agent sessions (prevent credential leakage in shell history)
- [ ] Git pre-push hook preventing force-push to protected branches
- [ ] Filesystem snapshot before dangerous-mode sessions (Btrfs/ZFS) or at minimum a git checkpoint

### Moderate effort, significant protection

- [ ] Run agent sessions in Docker with `--cap-drop ALL --security-opt no-new-privileges --network none` plus a proxy socket for allowed domains
- [ ] Proxy with domain allowlist (Anthropic API, GitHub, npm registry)
- [ ] Separate `.gitconfig` for agent sessions pointing to bot account
- [ ] Audit logging for agent sessions (subprocess output capture)
- [ ] `auditd` rules on sensitive paths (`~/.ssh`, `~/.aws`, `~/.gnupg`)

### High effort, maximum isolation

- [ ] Separate OS user for the agent with group-based project access
- [ ] gVisor runtime for containers (kernel-level syscall interception)
- [ ] Credential-injecting proxy (VaultAgent, 1Password SDK, or custom Envoy config)
- [ ] Full VM isolation (Firecracker microVM) for untrusted repo work
- [ ] Immutable infrastructure: Nix/Ansible-managed system config for guaranteed rollback

### What the research doesn't answer

- **Liability.** If the bot account pushes something that violates a license or exposes a secret, GitHub ToS says the human owner is responsible. What that means legally beyond ToS is unclear.
- **Cost of credential rotation.** Short-lived tokens are better security, but the operational cost of token refresh infrastructure for a solo developer may not be worth it compared to a 90-day PAT.
- **Prompt injection via project files.** If the agent reads a malicious `README.md` or `.env` that contains instructions, no amount of host hardening prevents the agent from following those instructions within its allowed scope. This is a model-level problem, not an environment-level one.
