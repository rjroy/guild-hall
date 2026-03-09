# guild-hall-email

Read-only access to the user's Fastmail inbox via JMAP.

## Prerequisites (REQ-EMT-14)

1. **Fastmail Individual plan** ($6/mo) or higher. The API is not available on free or trial accounts.

2. **API token** with read-only scope. Create one at:
   Settings > Privacy & Security > Manage API tokens.
   Grant only the `Mail` read scope. The toolbox never writes to the mailbox.

3. **Environment variable**: Set `FASTMAIL_API_TOKEN` to the token value before starting the daemon.

   ```bash
   export FASTMAIL_API_TOKEN="fmu1-..."
   ```

## Usage

Add `"guild-hall-email"` to a worker's `domainToolboxes` array in its `package.json`:

```json
{
  "guildHall": {
    "domainToolboxes": ["guild-hall-email"]
  }
}
```

The toolbox will be resolved and loaded automatically when the worker is activated.
