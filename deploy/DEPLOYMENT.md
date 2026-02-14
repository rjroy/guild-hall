# Deployment

## Running as a systemd service

Guild Hall includes a systemd service file for running as an always-on service.

### Setup

1. **Create the environment file:**
   ```bash
   mkdir -p ~/.config/guild-hall
   cat > ~/.config/guild-hall/env <<EOF
   ANTHROPIC_API_KEY=your-api-key-here
   NODE_ENV=production
   EOF
   chmod 600 ~/.config/guild-hall/env
   ```

2. **Build the production bundle:**
   ```bash
   bun run build
   ```

3. **Install the service file:**
   ```bash
   sudo cp deploy/guild-hall.service /etc/systemd/system/
   sudo systemctl daemon-reload
   ```

4. **Enable and start the service:**
   ```bash
   sudo systemctl enable guild-hall
   sudo systemctl start guild-hall
   ```

5. **Check status:**
   ```bash
   sudo systemctl status guild-hall
   journalctl -u guild-hall -f  # follow logs
   ```

### Managing the service

- **Stop:** `sudo systemctl stop guild-hall`
- **Restart:** `sudo systemctl restart guild-hall`
- **Disable:** `sudo systemctl disable guild-hall`
- **View logs:** `journalctl -u guild-hall -n 100`

### Updating

After pulling new changes:

```bash
bun install
bun run build
sudo systemctl restart guild-hall
```

### Notes

- The service runs on port 5050 (configured in package.json)
- Session data is stored in the working directory
- The service restarts automatically on failure
- Logs go to systemd journal (view with `journalctl`)

### Security

The service file includes basic security hardening:
- Runs as your user (not root)
- NoNewPrivileges prevents privilege escalation
- PrivateTmp isolates /tmp
- ProtectSystem/ProtectHome limit filesystem access
- ReadWritePaths grants write access only to the project directory

If you need to adjust file permissions or access, modify the `ReadWritePaths` directive.
