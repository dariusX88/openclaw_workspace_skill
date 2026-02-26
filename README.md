# openclaw-workspace-skill (VPS-first)

Native workspace for OpenClaw: docs (Notion-lite), tables (Sheet-lite), calendar, files.
No Google/OAuth required.

## Run on VPS

### 1) Copy env

```bash
cp .env.example .env
nano .env
```

### 2) Start stack

```bash
docker compose up -d --build
```

### 3) Apply migrations

```bash
docker exec -it openclaw-workspace-skill-db-1 psql -U workspace -d workspace -f /migrations/001_init.sql
```

> If container name differs, use `docker ps`.

To mount migrations into the db container automatically, add this to the `db` service in `docker-compose.yml`:

```yaml
volumes:
  - ./migrations:/migrations
```

### 4) Test

```bash
curl -s http://localhost:8081/health
```

## OpenClaw skill

See `packages/openclaw-skill/README.md`.

## Architecture

```
┌─────────────────┐     ┌──────────────┐
│  OpenClaw Skill  │────▶│ Workspace API│
│  (tools.json)    │     │ (Fastify)    │
└─────────────────┘     └──────┬───────┘
                               │
                        ┌──────▼───────┐
                        │  PostgreSQL   │
                        │  (workspace)  │
                        └──────────────┘
```

### Security baseline (MVP)

- API exposed only on VPS (port 8081). For external access, use Caddy with basic auth + IP allowlist.
- `WORKSPACE_SERVICE_TOKEN` must be long (min 32+ chars).
- In MVP, the skill is server-to-server. Multi-user auth comes in v0.2.
