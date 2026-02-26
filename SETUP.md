# OpenClaw Workspace Skill — Full Setup Guide

> Native workspace with **Docs**, **Tables**, **Calendar**, **File Storage**, and **Web Dashboard** for OpenClaw.
> No Google, no OAuth — just Postgres + Fastify on your VPS.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Quick Install (One Command)](#quick-install-one-command)
5. [Manual Installation](#manual-installation)
6. [OpenClaw Skill Registration](#openclaw-skill-registration)
7. [Workspace Dashboard](#workspace-dashboard)
8. [Verify Everything Works](#verify-everything-works)
9. [API Reference](#api-reference)
10. [Security](#security)
11. [VPS Quick Reference](#vps-quick-reference)
12. [Troubleshooting](#troubleshooting)
13. [Uninstall](#uninstall)

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
| **Dashboard** | Web UI to view, edit, download, and manage all content from any browser |
| **Search** | Full-text search across all content types |
| **Export** | Download docs as `.md`, tables as `.csv`, calendars as `.ics` |

Everything runs on your VPS — no external APIs, no Google accounts, no third-party dependencies.

### What OpenClaw Can Do With This Skill

Once installed, OpenClaw can:
- Create workspaces, docs, tables, calendars via `curl` commands
- Store research, notes, structured data, and files
- Always provides a **dashboard link** (`http://<your-vps-ip>:8082/browser`) so you can view everything in your browser
- Search across all your content

### What the Dashboard Can Do

The web dashboard at `http://<your-vps-ip>:8082/browser` lets you:
- **View** all docs, tables, calendars, and files across workspaces
- **Edit** table cells inline (click to edit), doc titles, doc blocks, calendar events
- **Create** new workspaces, docs, tables, calendars, events, and add rows/blocks
- **Delete** any content with confirmation
- **Download** docs as Markdown, tables as CSV, calendars as ICS, files directly
- **Upload** files via drag-and-drop
- **Filter** by workspace
- **Dark mode** with auto-save preference
- **Auto-refresh** every 30 seconds

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
                                     |    - /browser (Dashboard UI)    |
User's Browser                       +-------------|------------------+
+---------------------+                            |
|  Dashboard UI       |  via         +-------------|------------------+
|  http://VPS:8082    |  public IP   |  db (Postgres 16)              |
|  /browser           |              |    - 11 tables, pgcrypto UUIDs |
+---------------------+              +--------------------------------+
```

**Three URL contexts:**
- **`172.17.0.1:8082`** — Used by OpenClaw container to reach the API (Docker bridge gateway)
- **`127.0.0.1:8082`** — Used from VPS terminal for testing
- **`<your-vps-ip>:8082`** — Used by you in your browser for the dashboard

**Two auth methods:**
- **Bearer token** — For the API (OpenClaw uses this via curl)
- **Cookie-based** — For the dashboard (you login with your token, browser stores a cookie)

---

## Prerequisites

- **VPS** with Docker and Docker Compose installed
- **OpenClaw** already running (container name typically `openclaw-omoa-openclaw-1`)
- **SSH access** to your VPS
- ~100MB disk space
- **Port 8082** open in firewall (for dashboard access from your browser)

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

### Step 6: Open the firewall port

```bash
# If using ufw:
ufw allow 8082/tcp

# If using iptables directly:
iptables -I INPUT -p tcp --dport 8082 -j ACCEPT
```

---

## OpenClaw Skill Registration

### Step 7: Find your OpenClaw data directory

```bash
# Typical locations:
# /docker/openclaw-omoa/data/.openclaw/
# Check with:
OPENCLAW_DATA=$(docker inspect $(docker ps --format '{{.Names}}' | grep -i openclaw | grep -v workspace_skill | head -1) --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}')
echo "OpenClaw data dir: ${OPENCLAW_DATA}"
```

**Important:** The `grep -v workspace_skill` excludes our own workspace containers from matching.

### Step 8: Install SKILL.md

```bash
# Read your token
SVC_TOKEN=$(grep WORKSPACE_SERVICE_TOKEN .env | cut -d= -f2)

# Create skill directory
mkdir -p "${OPENCLAW_DATA}/.openclaw/skills/workspace"

# Detect public IPv4 for dashboard URL (force IPv4 to avoid IPv6)
VPS_IP=$(curl -4 -sf --max-time 3 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
DASHBOARD_URL="http://${VPS_IP}:8082/browser"

# Copy and inject token, Docker bridge IP for API calls, and dashboard URL for the user
sed "s|http://localhost:8082|http://172.17.0.1:8082|g; s|{{WORKSPACE_SERVICE_TOKEN}}|${SVC_TOKEN}|g; s|{{DASHBOARD_URL}}|${DASHBOARD_URL}|g" \
  packages/openclaw-skill/SKILL.md > "${OPENCLAW_DATA}/.openclaw/skills/workspace/SKILL.md"

echo "SKILL.md installed at: ${OPENCLAW_DATA}/.openclaw/skills/workspace/SKILL.md"
echo "Dashboard URL: ${DASHBOARD_URL}"
```

**What this does:** SKILL.md is a template with 3 placeholders:
- `http://localhost:8082` → replaced with `http://172.17.0.1:8082` (Docker bridge IP for API calls)
- `{{WORKSPACE_SERVICE_TOKEN}}` → replaced with your actual token
- `{{DASHBOARD_URL}}` → replaced with `http://<your-public-ip>:8082/browser`

### Step 9: Register in OpenClaw config

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

### Step 10: Restart OpenClaw

```bash
OPENCLAW_CONTAINER=$(docker ps --filter "name=openclaw" --format '{{.Names}}' | grep -v workspace_skill | head -1)
docker restart "${OPENCLAW_CONTAINER}"
sleep 5
docker logs "${OPENCLAW_CONTAINER}" --tail 5
```

Check for clean startup (no errors).

### Step 11: Start a NEW chat session

**Important:** Open a **brand new conversation** in the OpenClaw UI. Skills only load when a session starts — existing conversations won't see the new skill.

---

## Workspace Dashboard

The workspace skill includes a full web dashboard at `/browser`. No extra setup needed — it's part of the API.

### Access

Open in your browser:

```
http://<your-vps-ip>:8082/browser
```

### Login

Enter your `WORKSPACE_SERVICE_TOKEN` on the login page. This sets an HttpOnly cookie valid for 24 hours.

### Features

The dashboard has 4 tabs:

#### Files Tab
- **Upload files** via drag-and-drop or file picker (up to 50MB)
- **Download files** with one click
- **Delete files** with confirmation dialog
- **File metadata** — name, type, size, workspace, upload date

#### Docs Tab
- **View** all document pages with their content blocks
- **Edit titles** — click the title to edit inline
- **Edit blocks** — hover over a block, click ✏️ to edit in a modal
- **Delete blocks** — hover over a block, click ✕
- **Add blocks** — click "+ Add Block" at the bottom
- **Download** as Markdown (`.md`)

#### Tables Tab
- **View** tables with columns and rows
- **Edit cells inline** — click any cell to edit, press Enter to save, Escape to cancel
- **Add rows** — click "+ Add Row" button
- **Delete rows** — click ✕ on any row
- **Download** as CSV (`.csv`)

#### Calendar Tab
- **View** events sorted by date
- **Edit events** — click ✏️ to edit title, description, start/end times
- **Delete events** — click ✕ with confirmation
- **Add events** — click "+ Add Event" button
- **Download** as iCalendar (`.ics`) — importable to Google Calendar, Outlook, Apple Calendar

#### Global Features
- **Workspace filter** — dropdown to filter all tabs by workspace
- **Create modal** — "+ Create" button to make new workspaces, docs, tables, calendars
- **Dark mode** — toggle with moon/sun icon, preference saved
- **Auto-refresh** — data refreshes every 30 seconds (green dot indicator)
- **Responsive** — works on desktop and mobile

### How Auth Works

The dashboard uses **cookie-based auth**, separate from the API's Bearer token auth:

1. Visit `/browser` → login form appears
2. Enter your service token → sets `HttpOnly` cookie, redirects to dashboard
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

### From the dashboard:

1. Open `http://<your-vps-ip>:8082/browser` in your browser
2. Login with your service token
3. You should see the workspace you just created
4. Try creating a doc, editing a table cell, adding an event

### From OpenClaw chat (new session):

> "Use the workspace skill to create a workspace called HelloWorld"

OpenClaw should create it AND provide the dashboard link.

If the skill doesn't trigger, paste the endpoint reference directly:

> The workspace API is at http://172.17.0.1:8082. Auth header: Authorization: Bearer YOUR_TOKEN. Create a workspace by POSTing to /workspaces with {"name": "HelloWorld"}.

---

## API Reference

### Bearer Token Auth (for OpenClaw / curl)

All endpoints require: `Authorization: Bearer <WORKSPACE_SERVICE_TOKEN>`

#### Workspaces

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| POST | `/workspaces` | `{"name": "..."}` | `{id, name, created_at}` |
| GET | `/workspaces` | — | `{workspaces: [...]}` |
| PUT | `/workspaces/:id` | `{"name": "..."}` | `{id, name}` |
| DELETE | `/workspaces/:id` | — | `{ok: true}` |

#### Docs (Notion-lite)

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| POST | `/docs/pages` | `{"workspaceId": "...", "title": "..."}` | `{id}` |
| GET | `/docs/pages?workspaceId=...` | — | `{pages: [...]}` |
| GET | `/docs/pages/:id` | — | `{page, blocks}` |
| PUT | `/docs/pages/:id` | `{"title": "..."}` | `{id, title}` |
| DELETE | `/docs/pages/:id` | — | `{ok: true}` |
| POST | `/docs/pages/:id/blocks` | `{"type": "text", "data": {"content": "..."}, "orderIndex": 0}` | `{id}` |
| PUT | `/docs/pages/:pageId/blocks/:blockId` | `{"type": "...", "data": {...}}` | `{ok, id}` |
| DELETE | `/docs/pages/:pageId/blocks/:blockId` | — | `{ok: true}` |
| GET | `/docs/pages/:id/export/markdown` | — | Markdown file download |

Block types: `text`, `heading`, `list`, `code`, `image`, `table`

#### Tables (Sheet-lite)

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| POST | `/tables` | `{"workspaceId": "...", "name": "..."}` | `{id}` |
| PUT | `/tables/:id` | `{"name": "..."}` | `{id, name}` |
| DELETE | `/tables/:id` | — | `{ok: true}` |
| POST | `/tables/:id/columns` | `{"name": "...", "type": "text", "orderIndex": 0}` | `{id}` |
| POST | `/tables/:id/rows` | `{"cells": {"<columnId>": "value"}}` | `{rowId}` |
| PUT | `/tables/:tableId/rows/:rowId` | `{"cells": {"<columnId>": "value"}}` | `{ok, rowId}` |
| DELETE | `/tables/:tableId/rows/:rowId` | — | `{ok: true}` |
| GET | `/tables/:id/rows?limit=50` | — | `{rows, cells}` |
| GET | `/tables/:id/export/csv` | — | CSV file download |

Column types: `text`, `number`, `date`, `boolean`, `select`, `url`

#### Calendar

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| POST | `/calendars` | `{"workspaceId": "...", "name": "..."}` | `{id}` |
| DELETE | `/calendars/:id` | — | `{ok: true}` |
| POST | `/calendars/:id/events` | `{"title": "...", "startTs": "ISO", "endTs": "ISO"}` | `{id}` |
| PUT | `/calendars/:calId/events/:eventId` | `{"title": "...", "startTs": "...", "endTs": "..."}` | `{id}` |
| DELETE | `/calendars/:calId/events/:eventId` | — | `{ok: true}` |
| GET | `/calendars/:id/events?from=ISO&to=ISO` | — | `{events: [...]}` |
| GET | `/calendars/:id/export/ics` | — | ICS file download |

#### Files

| Method | Endpoint | Body | Returns |
|--------|----------|------|---------|
| GET | `/files?workspaceId=...` | — | `{files: [...]}` |
| POST | `/files?workspaceId=...` | multipart `file` field | `{id}` |
| GET | `/files/:id/download` | — | file stream |
| GET | `/files/:id/text` | — | `{id, filename, pages, text}` (PDF only) |
| DELETE | `/files/:id` | — | `{ok: true}` |

#### Search

| Method | Endpoint | Returns |
|--------|----------|---------|
| GET | `/search?q=KEYWORD&workspaceId=...` | `{query, results: {pages, blocks, tables, events, files}, total}` |

### Dashboard Endpoints (Cookie Auth)

These are used by the dashboard UI. Same data, but authenticated via browser cookie instead of Bearer token.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/browser` | Dashboard web UI |
| GET | `/browser/api/workspaces` | List workspaces |
| POST | `/browser/api/workspaces` | Create workspace |
| PUT | `/browser/api/workspaces/:id` | Rename workspace |
| GET | `/browser/api/files` | List files |
| POST | `/browser/api/files` | Upload file |
| GET | `/browser/api/files/:id/download` | Download file |
| DELETE | `/browser/api/files/:id` | Delete file |
| GET | `/browser/api/docs/pages` | List docs |
| GET | `/browser/api/docs/pages/:id` | Get doc with blocks |
| POST | `/browser/api/docs/pages` | Create doc |
| PUT | `/browser/api/docs/pages/:id` | Update doc title |
| DELETE | `/browser/api/docs/pages/:id` | Delete doc |
| POST | `/browser/api/docs/pages/:id/blocks` | Add block |
| PUT | `/browser/api/docs/pages/:pageId/blocks/:blockId` | Edit block |
| DELETE | `/browser/api/docs/pages/:pageId/blocks/:blockId` | Delete block |
| GET | `/browser/api/docs/pages/:id/export/markdown` | Download as .md |
| GET | `/browser/api/tables` | List tables |
| GET | `/browser/api/tables/:id` | Get table with data |
| POST | `/browser/api/tables` | Create table |
| PUT | `/browser/api/tables/:id` | Rename table |
| DELETE | `/browser/api/tables/:id` | Delete table |
| POST | `/browser/api/tables/:id/columns` | Add column |
| POST | `/browser/api/tables/:id/rows` | Add row |
| PUT | `/browser/api/tables/:tableId/rows/:rowId` | Edit row cells |
| DELETE | `/browser/api/tables/:tableId/rows/:rowId` | Delete row |
| GET | `/browser/api/tables/:id/export/csv` | Download as .csv |
| GET | `/browser/api/calendars` | List calendars |
| GET | `/browser/api/calendars/:id/events` | Get events |
| POST | `/browser/api/calendars` | Create calendar |
| DELETE | `/browser/api/calendars/:id` | Delete calendar |
| POST | `/browser/api/calendars/:id/events` | Add event |
| PUT | `/browser/api/calendars/:calId/events/:eventId` | Edit event |
| DELETE | `/browser/api/calendars/:calId/events/:eventId` | Delete event |
| GET | `/browser/api/calendars/:id/export/ics` | Download as .ics |

Max file size: 50MB

---

## Security

### Current Security Model

**What IS protected:**
- All API endpoints require authentication (Bearer token or session cookie)
- Session cookies are `HttpOnly` (JavaScript can't steal them) and `SameSite=Strict`
- The service token is a 40+ character random string (hard to brute-force)
- Postgres is not exposed to the internet (only accessible inside Docker network)
- Uploaded files are stored on disk with UUIDs (not guessable filenames)

**What is NOT protected (risks):**
- **No HTTPS** — Traffic between your browser and VPS is unencrypted (HTTP). Anyone on the same network can see your token and data. This is the biggest risk.
- **No rate limiting** — Someone could try to brute-force the token (unlikely with 40+ chars, but no protection against it)
- **Single shared token** — Everyone who has the token has full access. No per-user accounts, no role-based access.
- **No input sanitization beyond SQL parameterization** — SQL injection is prevented, but there's no XSS filtering on stored content (blocks, event descriptions). If someone injects malicious HTML via the API, the dashboard might render it.
- **Port 8082 is public** — Anyone who knows your VPS IP can see the login page

### Recommendations for Better Security

#### 1. Add HTTPS (Strongly Recommended)

Use a reverse proxy like Caddy or Nginx with Let's Encrypt:

```bash
# Example with Caddy (simplest):
# 1. Point a domain to your VPS IP (e.g., workspace.yourdomain.com)
# 2. Install Caddy
# 3. Create Caddyfile:
cat > /etc/caddy/Caddyfile << 'EOF'
workspace.yourdomain.com {
    reverse_proxy localhost:8082
}
EOF
# Caddy auto-provisions HTTPS certificates
```

With HTTPS, your token and data are encrypted in transit.

#### 2. Restrict Access by IP (Optional)

If only you use it, restrict port 8082 to your IP:

```bash
# Allow only your IP
iptables -I INPUT -p tcp --dport 8082 -s YOUR_HOME_IP -j ACCEPT
iptables -I INPUT -p tcp --dport 8082 -j DROP
```

#### 3. Use a VPN (Alternative to IP restriction)

Set up WireGuard or Tailscale on your VPS, then only access port 8082 through the VPN.

### Is it safe enough for personal use?

**Yes**, for personal/solo use it's reasonably safe:
- The token is strong (40+ random characters)
- Postgres is internal-only
- Cookie auth is HttpOnly + SameSite

**For sharing with others**, add HTTPS first. Without it, anyone on a shared network (coffee shop, office) could intercept the token.

**For business/production use**, you'd want: HTTPS, per-user accounts, rate limiting, input sanitization, audit logs, and backups.

---

## VPS Quick Reference

Commands you'll use most often when managing the workspace on your VPS.

### Check status

```bash
cd /docker/openclaw_workspace_skill
docker compose ps                    # See running containers
docker compose logs api --tail 20    # Check API logs
docker compose logs db --tail 20     # Check Postgres logs
curl -s http://127.0.0.1:8082/health # Health check
```

### Update to latest version

```bash
cd /docker/openclaw_workspace_skill
git pull
docker compose build --no-cache api
docker compose up -d api
```

**Important:** Always use `--no-cache` when rebuilding. Docker caches build layers aggressively, and without this flag your code changes may not be picked up.

### Re-install SKILL.md (after code updates)

```bash
cd /docker/openclaw_workspace_skill
SVC_TOKEN=$(grep WORKSPACE_SERVICE_TOKEN .env | cut -d= -f2)
OPENCLAW_DATA=$(docker inspect $(docker ps --format '{{.Names}}' | grep -i openclaw | grep -v workspace_skill | head -1) --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}')
VPS_IP=$(curl -4 -sf --max-time 3 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
DASHBOARD_URL="http://${VPS_IP}:8082/browser"

mkdir -p "${OPENCLAW_DATA}/.openclaw/skills/workspace"
sed "s|http://localhost:8082|http://172.17.0.1:8082|g; s|{{WORKSPACE_SERVICE_TOKEN}}|${SVC_TOKEN}|g; s|{{DASHBOARD_URL}}|${DASHBOARD_URL}|g" \
  packages/openclaw-skill/SKILL.md > "${OPENCLAW_DATA}/.openclaw/skills/workspace/SKILL.md"

# Restart OpenClaw to pick up changes
docker restart $(docker ps --format '{{.Names}}' | grep -i openclaw | grep -v workspace_skill | head -1)
```

Then open a **new conversation** in OpenClaw.

### View your token

```bash
cd /docker/openclaw_workspace_skill
cat .env
```

### Restart everything

```bash
cd /docker/openclaw_workspace_skill
docker compose restart
```

### Full rebuild (if something is broken)

```bash
cd /docker/openclaw_workspace_skill
docker compose down
docker compose build --no-cache
docker compose up -d
# Wait for Postgres
sleep 10
# Re-run migrations (safe to run multiple times — uses CREATE TABLE IF NOT EXISTS)
docker compose exec -T db psql -U workspace -d workspace < migrations/001_init.sql
```

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

### Dashboard not accessible from browser

**Causes:**
1. **Firewall blocking port 8082:**
   ```bash
   ufw allow 8082/tcp
   # or
   iptables -I INPUT -p tcp --dport 8082 -j ACCEPT
   ```

2. **Containers not running:**
   ```bash
   cd /docker/openclaw_workspace_skill
   docker compose ps
   docker compose up -d
   ```

3. **API not healthy:**
   ```bash
   curl -s http://127.0.0.1:8082/health
   # Should return {"ok":true}
   # If not, check logs:
   docker compose logs api --tail 30
   ```

### Docker build doesn't pick up code changes

**Cause:** Docker caches build layers aggressively.

**Fix:** Always use `--no-cache`:

```bash
docker compose build --no-cache api
docker compose up -d api
```

### Dashboard URL shows IPv6 address

**Cause:** `curl https://ifconfig.me` returned IPv6 instead of IPv4.

**Fix:** Force IPv4 with `-4` flag:

```bash
curl -4 -sf https://ifconfig.me
# Should return something like: 187.77.72.183
```

The install script already uses `-4`, but if you're re-installing SKILL.md manually, make sure to use `curl -4`.

### Wrong container restarted (workspace_skill instead of OpenClaw)

**Cause:** `docker ps --filter "name=openclaw"` matches both `openclaw-omoa-openclaw-1` AND `openclaw_workspace_skill-api-1`.

**Fix:** Always exclude workspace_skill containers:

```bash
docker ps --format '{{.Names}}' | grep -i openclaw | grep -v workspace_skill | head -1
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

### OpenClaw shows wrong dashboard URL

**Cause:** SKILL.md was installed before the URL fix, or IPv6 was used.

**Fix:** Re-install SKILL.md (see [VPS Quick Reference](#vps-quick-reference) above).

### Clicking "Open" in Hostinger shows 404

**Cause:** Hostinger's "Open" button goes to `/` (root), but the API doesn't have a root route.

**This is normal.** The dashboard is at `/browser`, not `/`. Bookmark `http://<your-vps-ip>:8082/browser` instead.

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
