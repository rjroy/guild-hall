---
title: "Commission: Brainstorm: Running Guild Hall on Windows"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm what it means to run Guild Hall natively on Windows (not WSL). The goal is a `.lore/brainstorm/` artifact that maps out the problem space and explores solutions.\n\n## Context\n\nGuild Hall is a Bun-based monorepo (daemon + Next.js web + CLI). The daemon serves over a Unix socket (`~/.guild-hall/guild-hall.sock`) using `Bun.serve({ unix, fetch })`. The web layer and CLI both connect to this socket. The user has identified Unix sockets as the primary obstacle for Windows support.\n\n## What to investigate\n\n1. **Unix socket dependency audit.** Where exactly does the codebase depend on Unix sockets? Map every touchpoint: daemon startup (`daemon/index.ts`), client connections (web API calls, CLI calls), PID file and socket cleanup, path conventions. How deep does the dependency go?\n\n2. **Windows socket alternatives.** What are the realistic options for IPC on Windows?\n   - Named Pipes (the native Windows IPC primitive)\n   - TCP localhost (the universal fallback)\n   - Windows Unix socket support (AF_UNIX was added in Windows 10 1803, but with limitations)\n   - Any other viable mechanisms\n\n   For each: what are the tradeoffs (performance, security, complexity, Bun support)?\n\n3. **Bun on Windows.** What's the current state of Bun's Windows support? Does `Bun.serve()` support named pipes or TCP? What Bun APIs does Guild Hall use that might behave differently on Windows? Check git operations (`child_process` spawning), filesystem paths (forward vs backslash), temp directories, symlinks/worktrees.\n\n4. **Beyond sockets.** What else breaks on Windows proper?\n   - Git worktree behavior on Windows (NTFS, path lengths, symlinks)\n   - Shell commands in `daemon/lib/git.ts` (assumes bash/POSIX shell)\n   - File path separators throughout the codebase\n   - `~/.guild-hall/` home directory convention\n   - PID files and process management\n   - Pre-commit hooks (shell scripts)\n   - Any other POSIX assumptions\n\n5. **Architecture options.** Sketch out possible approaches:\n   - **Abstraction layer**: Abstract the transport so the daemon can serve over Unix socket OR named pipe OR TCP depending on platform\n   - **TCP fallback**: Always use TCP on Windows, keep Unix socket on POSIX\n   - **Windows AF_UNIX**: Use Windows' own Unix socket support (what are the limitations?)\n   - **Hybrid**: Some combination\n\n6. **Migration path.** What would a phased approach look like? What can be done incrementally vs. what requires a big-bang change? What's the minimum viable Windows support?\n\nWrite this up as a brainstorm artifact. Be thorough on the technical details, especially around Bun's current Windows capabilities and the socket alternatives."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T13:30:17.446Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T13:30:17.449Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
