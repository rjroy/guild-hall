# Deployment

## Running as a user service

Guild Hall runs as a systemd user service (no root required).

### Setup

```bash
./deploy/install.sh
```

This builds the production bundle, installs the service, and starts it on port 5050. Authentication uses pre-configured OAuth (no API key needed).

### Managing the service

- **Status:** `systemctl --user status guild-hall`
- **Stop:** `systemctl --user stop guild-hall`
- **Restart:** `systemctl --user restart guild-hall`
- **Disable:** `systemctl --user disable guild-hall`
- **Logs:** `journalctl --user -u guild-hall -f`

### Updating

After pulling new changes:

```bash
./deploy/install.sh
```

The script rebuilds and restarts the service.

### Notes

- The service runs on port 5050
- Session data is stored in the working directory
- The service restarts automatically on failure
- Logs go to the user journal (view with `journalctl --user`)
