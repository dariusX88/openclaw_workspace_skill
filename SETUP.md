# OpenClaw Workspace Skill — Full Setup Guide

> Native workspace with **Docs**, **Tables**, **Calendar**, **File Storage**, and **Web File Browser** for OpenClaw.
> No Google, no OAuth — just Postgres + Fastify on your VPS.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Quick Install (One Command)](#quick-install-one-command)
5. [Manual Installation](#manual-installation)
6. [OpenClaw Skill Registration](#openclaw-skill-registration)
7. [Web File Browser](#web-file-browser)
7. [Verify Everything Works](#verify-everything-works)
8. [API Reference](#api-reference)
9. [Troubleshooting](#troubleshooting)
10. [Uninstall](#uninstall)

---

## Overview

This project adds a **Workspace** skill to OpenClaw, giving it the ability to:

| Feature | Description |
|---------|-------------|
| **Docs** (Notion-lite) | Create pages with typed blocks (text, heading, list, code, image, table) |
| **Tables** (Sheet-lite) | Create tables with typed columns (text, number, date, boolean, select, url) and rows |
| **Calendar** | Create calendars with events, date-range queries |
| **Files** | Upload/download files (up to 50MB) via multipart |
| **Workspaces** | Group all resources under named workspaces |

Everything runs on your VPS — no external APIs, no Google accounts, no third-party dependencies.

---

## Architecture

```
OpenClaw Container                    Workspace Stack (Docker Compose)
+---------------------+              +--------------------------------+
|                     |   HTTP/REST  |  api (Fastify v5, port 8082)   |
|  LLM Agent          |  --------->  |    - /workspaces               |
|  reads SKILL.md     |  via         |    - /docs/pages, /blocks      |
|  executes curl      |  172.17.0.1  |    - /tables, /columns, /rows  |
|                     |              |    - /calendars, /events        |
+---------------------+              |    - /files                     |
                                     +-------------|------------------+
                                                   |
                                     +-------------|------------------+
                                     |  db (Postgres 16)              |
                                     |    - 11 tables, pgcrypto UUIDs |
                                     +--------------------------------+
```

**Key networking detail:** OpenClaw runs in its own Docker network. Our API runs in a separate Docker Compose network. They communicate via `172.17.0.1` (Docker bridge gateway = the host machine).

---

## Prerequisites

- **VPS** with Docker and Docker Compose installed
- **OpenClaw** already running (container name typically `openclaw-omoa-openclaw-1`)
- **SSH access** to your VPS
- ~100MB disk space

### Find your OpenClaw paths

Before installing, locate your OpenClaw data directory:

```bash
# Find the OpenClaw container
docker ps | grep openclaw

# Check its volume mounts
docker inspect <OPENCLAW_CONTAINER> --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}'
```

Look for the mount that maps to `/data` — that's your **OPENCLAW_DATA_DIR** (e.g., `/docker/openclaw-omoa/data`).

---

## Quick Install (One Command)

SSH into your VPS and run:

```bash
curl -sL https://raw.githubusercontent.com/dariusX88/openclaw_workspace_skill/main/install.sh | bash
```

Or if you prefer to review first:

```bash
wget https://raw.githubusercontent.com/dariusX88/openclaw_workspace_skill/main/install.sh
cat install.sh  # review it
bash install.sh
```

The installer will:
1. Clone the repository
2. Generate secure tokens
3. Build and start the Docker stack
4. Run database migrations
5. Install the SKILL.md into OpenClaw
6. Register the skill in OpenClaw's config
7. Restart OpenClaw

---

## Manual Installation

### Step 1: Clone the repository

```bash
cd /docker
git clone https://github.com/dariusX88/openclaw_workspace_skill.git
cd openclaw_workspace_skill
```

### Step 2: Create the `.env` file

```bash
cat > .env << 'EOF'
DB_PASSWORD=CHANGE_ME_TO_A_STRONG_PASSWORD
WORKSPACE_SERVICE_TOKEN=CHANGE_ME_TO_A_LONG_RANDOM_TOKEN
EOF
```

Generate secure values:

```bash
# Generate a random DB password
DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)

# Generate a random service token
SVC_TOKEN="wsk_$(openssl rand -base64 36 | tr -d '/+=' | head -c 40)"

# Write the .env
cat > .env << EOF
DB_PASSWORD=${DB_PASS}
WORKSPACE_SERVICE_TOKEN=${SVC_TOKEN}
EOF

echo "Generated tokens:"
echo "  DB_PASSWORD: ${DB_PASS}"
echo "  WORKSPACE_SERVICE_TOKEN: ${SVC_TOKEN}"
echo "Save these somewhere safe!"
```

### Step 3: Build and start the stack

```bash
docker compose build --no-cache
docker compose up -d
```

### Step 4: Wait for Postgres and run migrations

```bash
echo "Waiting for Postgres to start..."
sleep 8
docker compose exec -T db psql -U workspace -d workspace < migrations/001_init.sql
```

You should see:
```
CREATE EXTENSION
CREATE TABLE (x11)
```

### Step 5: Verify the API

```bash
curl -s http://127.0.0.1:8082/health
```

Expected: `{"ok":true}`

---

## OpenClaw Skill Registration

### Step 6: Find your OpenClaw data directory

```bash
# Typical locations:
# /docker/openclaw-omoa/data/.openclaw/
# Check with:
OPENCLAW_DATA=$(docker inspect $(docker ps -q --filter "name=openclaw") --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}')
echo "OpenClaw data dir: ${OPENCLAW_DATA}"
```

### Step 7: Install SKILL.md

```bash
# Read your token
SVC_TOKEN=$(grep WORKSPACE_SERVICE_TOKEN .env | cut -d= -f2)

# Create skill directory
mkdir -p "${OPENCLAW_DATA}/.openclaw/skills/workspace"

# Detect public IP for dashboard URL
VPS_IP=$(curl -sf --max-time 3 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
DASHBOARD_URL="http://${VPS_IP}:8082/browser"

# Copy and inject token, Docker bridge IP for API calls, and dashboard URL for the user
sed "s|http://localhost:8082|http://172.17.0.1:8082|g; s|{{WORKSPACE_SERVICE_TOKEN}}|${SVC_TOKEN}|g; s|{{DASHBOARD_URL}}|${DASHBOARD_URL}|g" \
  packages/openclaw-skill/SKILL.md > "${OPENCLAW_DATA}/.openclaw/skills/workspace/SKILL.md"

echo "SKILL.md installed at: ${OPENCLAW_DATA}/.openclaw/skills/workspace/SKILL.md"
```

### Step 8: Register in OpenClaw config

```bash
python3 -c "
import json
config_path = '${OPENCLAW_DATA}/.openclaw/openclaw.json'
with open(config_path) as f:
    cfg = json.load(f)
if 'skills' not in cfg:
    cfg['skills'] = {'entries': {}}
if 'entries' not in cfg['skills']:
    cfg['skills']['entries'] = {}
cfg['skills']['entries']['workspace'] = {'enabled': True}
with open(config_path, 'w') as f:
    json.dump(cfg, f, indent=2)
print('Registered workspace skill in openclaw.json')
"
```

### Step 9: Restart OpenClaw

```bash
OPENCLAW_CONTAINER=$(docker ps --filter "name=openclaw" --format '{{.Names}}' | head -1)
docker restart "${OPENCLAW_CONTAINER}"
sleep 5
docker logs "${OPENCLAW_CONTAINER}" --tail 5
```

Check for clean startup (no errors).

### Step 10: Start a NEW chat session

**Important:** Open a **brand new conversation** in the OpenClaw UI. Skills only load when a session starts — existing conversations won't see the new skill.

---

## Web File Browser

The workspace skill includes a built-in web file browser at `/browser`. No extra setup needed — it's part of the API.

### Access

Open in your browser:

```
http://<your-vps-ip>:8082/browser
```

### Login

Enter your `WORKSPACE_SERVICE_TOKEN` on the login page. This sets an HttpOnly cookie valid for 24 hours.

### Features

- **Browse files** across all workspaces or filter by workspace
- **Upload files** via drag-and-drop or file picker (up to 50MB)
- **Download files** with one click
- **Delete files** with confirmation dialog
- **File metadata** — name, type, size, workspace, upload date
- **Responsive** — works on desktop and mobile

### How Auth Works

The file browser uses **cookie-based auth**, separate from the API's Bearer token auth:

1. Visit `/browser` → login form appears
2. Enter your service token → sets `HttpOnly` cookie, redirects to file browser
3. All subsequent requests use the cookie automatically
4. Cookie expires after 24 hours, or click Logout

The existing Bearer-auth API endpoints are completely unchanged.

---

## Verify Everything Works

### From the VPS terminal:

```bash
TOKEN=$(grep WORKSPACE_SERVICE_TOKEN .env | cut -d= -f2)

# Create a workspace
curl -s -X POST http://172.17.0.1:8082/workspaces \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"name": "VerifyTest"}'
```

Expected: `{"id":"<uuid>","name":"VerifyTest","created_at":"..."}`

### From OpenClaw chat (new session):

> "Use the workspace skill to create a workspace called HelloWorld"

If the skill doesn't trigger, paste the endpoint reference directly:

> The workspace API is at http://172.17.0.1:8082. Auth header: Authorization: Bearer YOUR_TOKEN. Create a workspace by POSTing to /workspaces with {"name": "HelloWorld"}.

---

## API Reference

All endpoints require: `Authorization: Bearer <WORKSPACE_SERVICE_TOKEN>`

### Workspaces

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| POST | `/workspaces` | `{"name": "..."}` | `{id, name, created_at}` |
| GET | `/workspaces` | — | `{workspaces: [...]}` |

### Docs (Notion-lite)

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| POST | `/docs/pages` | `{"workspaceId": "...", "title": "..."}` | `{id}` |
| POST | `/docs/pages/:id/blocks` | `{"type": "text", "data": {"content": "..."}, "orderIndex": 0}` | `{id}` |
| GET | `/docs/pages/:id` | — | `{page, blocks}` |

Block types: `text`, `heading`, `list`, `code`, `image`, `table`

### Tables (Sheet-lite)

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| POST | `/tables` | `{"workspaceId": "...", "name": "..."}` | `{id}` |
| POST | `/tables/:id/columns` | `{"name": "...", "type": "text", "orderIndex": 0}` | `{id}` |
| POST | `/tables/:id/rows` | `{"cells": {"<columnId>": "value"}}` | `{id}` |
| GET | `/tables/:id/rows?limit=50` | — | `{rows: [...]}` |

Column types: `text`, `number`, `date`, `boolean`, `select`, `url`

### Calendar

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| POST | `/calendars` | `{"workspaceId": "...", "name": "..."}` | `{id}` |
| POST | `/calendars/:id/events` | `{"title": "...", "startTs": "ISO", "endTs": "ISO"}` | `{id}` |
| GET | `/calendars/:id/events?from=ISO&to=ISO` | — | `{events: [...]}` |

### Files

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/files?workspaceId=...` | — | `{files: [...]}` |
| POST | `/files?workspaceId=...` | multipart `file` field | `{id}` |
| GET | `/files/:id/download` | — | file stream |
| GET | `/files/:id/text` | — | `{id, filename, pages, text}` (PDF only) |

### File Browser (Cookie Auth)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/browser` | Web UI (login or file browser) |
| GET | `/browser/api/files` | List files |
| GET | `/browser/api/workspaces` | List workspaces |
| GET | `/browser/api/files/:id/download` | Download file |
| POST | `/browser/api/files` | Upload file |
| DELETE | `/browser/api/files/:id` | Delete file |

Max file size: 50MB

---

## Troubleshooting

### OpenClaw won't start after adding the skill

**Symptom:** "Config invalid" error in logs.

```bash
# Check the logs
docker logs <OPENCLAW_CONTAINER> --tail 20

# If "Unrecognized key" error, remove the bad key:
python3 -c "
import json
cfg_path = '<OPENCLAW_DATA>/.openclaw/openclaw.json'
with open(cfg_path) as f:
    cfg = json.load(f)
# Remove any unrecognized keys the error mentions
if 'sourceRoots' in cfg.get('plugins', {}):
    del cfg['plugins']['sourceRoots']
with open(cfg_path, 'w') as f:
    json.dump(cfg, f, indent=2)
"
docker restart <OPENCLAW_CONTAINER>
```

### "Connection failed (exit code 7)" from OpenClaw

**Cause:** OpenClaw can't reach `localhost:8082` because it's in a different Docker network.

**Fix:** SKILL.md must use `172.17.0.1` (Docker bridge gateway), not `localhost`:

```bash
sed -i 's|http://localhost:8082|http://172.17.0.1:8082|g' <OPENCLAW_DATA>/.openclaw/skills/workspace/SKILL.md
docker restart <OPENCLAW_CONTAINER>
```

### Migration fails with "role does not exist"

**Cause:** Wrong Postgres username. This project uses `workspace`, not `app` or `postgres`.

```bash
# Correct command:
docker compose exec -T db psql -U workspace -d workspace < migrations/001_init.sql
```

### Migration fails with "connection refused"

**Cause:** Postgres hasn't finished starting up.

```bash
# Wait longer:
sleep 10 && docker compose exec -T db psql -U workspace -d workspace < migrations/001_init.sql
```

### DB password change doesn't take effect

**Cause:** Postgres only reads `POSTGRES_PASSWORD` on first volume initialization.

```bash
# Nuclear option — destroys all data:
docker compose down -v
docker compose up -d
sleep 10
docker compose exec -T db psql -U workspace -d workspace < migrations/001_init.sql
```

### Skill doesn't appear in OpenClaw chat

**Causes & fixes:**

1. **SKILL.md in wrong directory:** Must be in OpenClaw's mounted data path, not `/root/.openclaw/`:
   ```bash
   # Find correct path:
   docker inspect <OPENCLAW_CONTAINER> --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}'
   # Copy to: <result>/.openclaw/skills/workspace/SKILL.md
   ```

2. **Not registered in config:** Add to `openclaw.json`:
   ```bash
   python3 -c "
   import json
   with open('<path>/openclaw.json') as f: cfg = json.load(f)
   cfg['skills']['entries']['workspace'] = {'enabled': True}
   with open('<path>/openclaw.json', 'w') as f: json.dump(cfg, f, indent=2)
   "
   ```

3. **Old chat session:** Skills load at session start. **Open a new conversation** in the OpenClaw UI.

### OpenClaw ignores SKILL.md endpoints

**Symptom:** OpenClaw guesses wrong endpoints like `/workspaces/{id}/docs`.

**Fix:** Paste the endpoint reference directly into chat:

> The workspace API endpoints are flat (not nested). Docs: POST /docs/pages with workspaceId in body. Tables: POST /tables with workspaceId in body. Calendars: POST /calendars with workspaceId in body.

---

## Uninstall

```bash
# Stop and remove the workspace stack
cd /docker/openclaw_workspace_skill
docker compose down -v

# Remove the skill from OpenClaw
rm -rf <OPENCLAW_DATA>/.openclaw/skills/workspace

# Remove config entry
python3 -c "
import json
cfg_path = '<OPENCLAW_DATA>/.openclaw/openclaw.json'
with open(cfg_path) as f: cfg = json.load(f)
cfg['skills']['entries'].pop('workspace', None)
with open(cfg_path, 'w') as f: json.dump(cfg, f, indent=2)
"

# Restart OpenClaw
docker restart <OPENCLAW_CONTAINER>

# Remove the repo
rm -rf /docker/openclaw_workspace_skill
```

---

## License

MIT
