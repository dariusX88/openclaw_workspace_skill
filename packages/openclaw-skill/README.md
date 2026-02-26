# OpenClaw Workspace Skill

Generic skill wrapper that connects OpenClaw to the Workspace API.

## Tools provided

| Tool | Description |
|------|-------------|
| `workspace_create_page` | Create a docs page in a workspace |
| `workspace_add_block` | Add a content block to a docs page |
| `workspace_create_table` | Create a table in a workspace |
| `workspace_create_event` | Create a calendar event |

## Configuration

Set these environment variables (or configure in `skill.json`):

- `WORKSPACE_API_URL` — URL of the workspace API (default: `http://localhost:8082`)
- `WORKSPACE_SERVICE_TOKEN` — Bearer token for API auth

## Installation in OpenClaw

### If `openclaw skills install` exists:

```bash
openclaw skills install https://github.com/YOUR_USER/openclaw-workspace-skill.git
```

### Manual installation:

1. Find the OpenClaw skills directory:
   ```bash
   ls -la /data/.openclaw 2>/dev/null || true
   find /data/.openclaw -maxdepth 3 -type d -iname "*skill*" 2>/dev/null
   ```

2. Clone into skills directory:
   ```bash
   cd /path/to/openclaw/skills/
   git clone https://github.com/YOUR_USER/openclaw-workspace-skill.git
   cd openclaw-workspace-skill/packages/openclaw-skill
   npm install
   ```

3. Restart OpenClaw container.

## Adapting to your runtime

The `index.ts` exports a `handlers` object. If your OpenClaw runtime expects a different format (e.g., `export default`, class-based, or callback-based), adapt accordingly — the HTTP calls stay the same.
