---
status: active
---
# Guild Hall API — Complete Command Reference

49 leaf operations across 7 top-level groups.

## `system`

| Command | Description |
|---|---|
| `system runtime daemon health` | Check daemon health status |
| `system packages worker list` | List discovered worker packages |
| `system events stream subscribe` | Subscribe to system event stream (SSE) |
| `system models catalog list` | List available AI models |
| `system config application reload` | Reload configuration from disk |
| `system config application validate` | Validate configuration and project paths |
| `system config application read` | Read application configuration |
| `system config project register` | Register a new project |
| `system config project group` | Set a project's group |
| `system config project deregister` | Deregister a project |
| `system config project read` | Read single project configuration |

## `meeting`

| Command | Description |
|---|---|
| `meeting request meeting create` | Create a new meeting and stream first turn |
| `meeting request meeting accept` | Accept a meeting request and stream first turn |
| `meeting request meeting decline` | Decline a meeting request |
| `meeting request meeting defer` | Defer a meeting request |
| `meeting request meeting list` | List meeting requests for a project |
| `meeting request meeting read` | Read meeting detail |
| `meeting session message send` | Send a message and stream response |
| `meeting session generation interrupt` | Stop current generation |
| `meeting session meeting close` | Close an active meeting |

## `commission`

| Command | Description |
|---|---|
| `commission request commission create` | Create a new commission |
| `commission request commission update` | Update a pending commission |
| `commission request commission note` | Add a user note to a commission |
| `commission request commission list` | List commissions for a project |
| `commission request commission read` | Read commission detail |
| `commission run dispatch` | Dispatch a commission to a worker |
| `commission run redispatch` | Re-dispatch a failed or cancelled commission |
| `commission run cancel` | Cancel a pending commission |
| `commission run abandon` | Abandon a running commission |
| `commission dependency project check` | Trigger dependency auto-transitions |
| `commission dependency project graph` | Get commission dependency graph |

## `coordination`

| Command | Description |
|---|---|
| `coordination review briefing read` | Generate project status briefing |

## `workspace`

| Command | Description |
|---|---|
| `workspace git branch rebase` | Rebase claude branch onto default branch |
| `workspace git integration sync` | Smart sync: fetch, detect merged PRs, rebase |
| `workspace git lore status` | Check for uncommitted `.lore/` changes |
| `workspace git lore commit` | Stage and commit `.lore/` changes |
| `workspace artifact document list` | List artifacts for a project |
| `workspace artifact document read` | Read a single artifact |
| `workspace artifact document write` | Write artifact content |
| `workspace artifact image read` | Serve raw image bytes for an artifact image |
| `workspace artifact image meta` | Get image artifact metadata |
| `workspace artifact mockup read` | Serve raw HTML for a mockup artifact |
| `workspace issue create` | Create an issue in `.lore/issues/` |

## `heartbeat`

| Command | Description |
|---|---|
| `heartbeat project tick tick` | Trigger immediate heartbeat evaluation for a project |
| `heartbeat project status status` | Get heartbeat state for a project |

## `email`

| Command | Description |
|---|---|
| `email inbox search` | Search for emails matching filter criteria |
| `email inbox read` | Read the full content of a specific email by ID |
| `email inbox mailboxes` | List all mailboxes (folders) |
| `email inbox thread` | Get all emails in a conversation thread |
