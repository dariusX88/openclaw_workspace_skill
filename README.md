# OpenClaw Workspace Skill

Native workspace for OpenClaw: **Docs** (Notion-lite), **Tables** (Sheet-lite), **Calendar**, and **File Storage**.
No Google, no OAuth — runs entirely on your VPS.

## Quick Install

SSH into your VPS and run:

```bash
curl -sL https://raw.githubusercontent.com/dariusX88/openclaw_workspace_skill/main/install.sh | bash
```

The installer handles everything: cloning, token generation, Docker build, migrations, and OpenClaw skill registration.

## What You Get

| Feature | Endpoints |
|---------|-----------|
| **Workspaces** | Create & list workspaces |
| **Docs** | Pages with typed blocks (text, heading, list, code, image, table) |
| **Tables** | Tables with typed columns (text, number, date, boolean, select, url) and rows |
| **Calendar** | Calendars with events, date-range queries |
| **Files** | Upload/download up to 50MB |

## Architecture

```
OpenClaw Container                    Workspace Stack (Docker Compose)
+---------------------+              +--------------------------------+
|                     |   HTTP/REST  |  api (Fastify v5, port 8081)   |
|  LLM Agent          |  --------->  |    /workspaces                 |
|  reads SKILL.md     |  via         |    /docs/pages, /blocks        |
|  executes curl      |  172.17.0.1  |    /tables, /columns, /rows    |
|                     |              |    /calendars, /events          |
+---------------------+              |    /files                       |
                                     +-------------|------------------+
                                                   |
                                     +-------------|------------------+
                                     |  db (Postgres 16)              |
                                     |    11 tables, pgcrypto UUIDs   |
                                     +--------------------------------+
```

## Manual Setup

If you prefer step-by-step instructions, see **[SETUP.md](SETUP.md)** for the full guide including:

- Manual installation steps
- OpenClaw skill registration
- API reference (all endpoints)
- Troubleshooting guide
- Uninstall instructions

## Manual Commands

```bash
# Clone
cd /docker
git clone https://github.com/dariusX88/openclaw_workspace_skill.git
cd openclaw_workspace_skill

# Configure
cp .env.example .env
nano .env   # Set strong DB_PASSWORD and WORKSPACE_SERVICE_TOKEN

# Build & start
docker compose build --no-cache
docker compose up -d

# Migrate (wait for Postgres to start)
sleep 8
docker compose exec -T db psql -U workspace -d workspace < migrations/001_init.sql

# Verify
curl -s http://127.0.0.1:8081/health
# => {"ok":true}
```

Then follow the [OpenClaw Skill Registration](SETUP.md#openclaw-skill-registration) section in SETUP.md.

## Stack

- **Fastify v5** — ESM, TypeScript, top-level await
- **PostgreSQL 16** — pgcrypto UUIDs, 11 tables
- **Docker Compose** — Two services (db + api)
- **OpenClaw SKILL.md** — Markdown-based skill with curl templates

## Security

- API exposed only on VPS (port 8081)
- Bearer token auth for all requests
- `WORKSPACE_SERVICE_TOKEN` should be 32+ characters
- For external access, use a reverse proxy (Caddy/nginx) with additional auth

## License

MIT
