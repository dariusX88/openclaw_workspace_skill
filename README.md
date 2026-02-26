<div align="center">

# 🗂️ OpenClaw Workspace Skill

**A self-hosted, 4-tab productivity dashboard for OpenClaw.**
Docs · Tables · Calendar · Files — all on your own VPS. No Google. No OAuth. No subscriptions.

[![Release](https://img.shields.io/github/v/release/dariusX88/openclaw_workspace_skill?style=flat-square&color=brightgreen)](https://github.com/dariusX88/openclaw_workspace_skill/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](./LICENSE)
[![Self-Hosted](https://img.shields.io/badge/self--hosted-VPS-orange?style=flat-square)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-Fastify%20v5-3178c6?style=flat-square)]()

</div>

---

## 📸 Dashboard Preview

> _Screenshot coming soon — deploy it and add yours via PR!_
>
> ---
>
> ## ✨ What Is This?
>
> **OpenClaw Workspace Skill** is a lightweight, self-hosted workspace that plugs directly into the [OpenClaw](https://openclaw.ai) AI agent platform. It gives your AI agent a real, persistent workspace to read from and write to — no external SaaS tools required.
>
> | Tab | What it does |
> |-----------|--------------------------------------------------------------|
> | 📄 **Docs** | Notion-lite pages with typed blocks (text, headings, lists, code, images, tables) |
> | 📊 **Tables** | Sheet-lite data with typed columns (text, number, date, boolean, select, URL) |
> | 📅 **Calendar** | Events with date-range queries and ICS export |
> | 📁 **Files** | Upload, manage, and download files up to 50 MB |
>
> ---
>
> ## 🚀 Quick Install
>
> SSH into your VPS and run:
>
> ```bash
> curl -sL https://raw.githubusercontent.com/dariusX88/openclaw_workspace_skill/main/install.sh | bash
> ```
>
> The installer handles everything automatically:
> - Clones the repo
> - - Generates a secure `WORKSPACE_SERVICE_TOKEN`
>   - - Builds the Docker image
>     - - Runs database migrations
>       - - Registers the skill with OpenClaw
>        
>         - > For a manual step-by-step guide, see [SETUP.md](./SETUP.md).
>           >
>           > ---
>           >
>           > ## 🛠️ Manual Setup
>           >
>           > ```bash
>           > # 1. Clone
>           > cd /docker
>           > git clone https://github.com/dariusX88/openclaw_workspace_skill.git
>           > cd openclaw_workspace_skill
>           >
>           > # 2. Configure
>           > cp .env.example .env
>           > nano .env   # Set DB_PASSWORD and WORKSPACE_SERVICE_TOKEN (32+ chars)
>           >
>           > # 3. Build & start
>           > docker compose build --no-cache
>           > docker compose up -d
>           >
>           > # 4. Run migrations
>           > sleep 8
>           > docker compose exec -T db psql -U workspace -d workspace < migrations/001_init.sql
>           >
>           > # 5. Verify
>           > curl -s http://127.0.0.1:8082/health
>           > # => {"ok":true}
>           > ```
>           >
>           > Then complete the **OpenClaw Skill Registration** steps in [SETUP.md](./SETUP.md).
>           >
>           > ---
>           >
>           > ## 📦 Export Formats
>           >
>           > | Feature | Export Format |
>           > |----------------|------------------------|
>           > | Docs | Markdown (`.md`) |
>           > | Tables | CSV |
>           > | Calendar Events | ICS (iCal) |
>           > | Files | Direct download |
>           >
>           > ---
>           >
>           > ## 🏗️ Architecture
>           >
>           > ```
>           > OpenClaw Agent                  Workspace Stack (Docker Compose)
>           > +--------------------+          +-----------------------------------+
>           > |                    |  HTTP/   | api  (Fastify v5 · port 8082)    |
>           > |  LLM Agent         |  REST    |   /workspaces                     |
>           > |  reads SKILL.md    | -------> |   /docs/pages  /blocks            |
>           > |  executes curl     |          |   /tables  /columns  /rows        |
>           > |                    |          |   /calendars  /events             |
>           > +--------------------+          |   /files                          |
>           >                                 +----------------+------------------+
>           >                                                  |
>           >                                 +----------------+------------------+
>           >                                 | db  (Postgres 16)                 |
>           >                                 |   11 tables · pgcrypto UUIDs      |
>           >                                 +-----------------------------------+
>           > ```
>           >
>           > ---
>           >
>           > ## 🔒 Security
>           >
>           > - API is exposed only on your VPS (port `8082`, not public by default)
>           > - - All requests require a **Bearer token** (`WORKSPACE_SERVICE_TOKEN`)
>           >   - - Token should be 32+ random characters
>           >     - - For external access, put Caddy or nginx in front with additional auth
>           >      
>           >       - ---
>           >
>           > ## 🧰 Stack
>           >
>           > | Layer | Technology |
>           > |------------|---------------------------|
>           > | API | Fastify v5, ESM, TypeScript |
>           > | Database | PostgreSQL 16, pgcrypto |
>           > | Container | Docker Compose |
>           > | Agent Interface | OpenClaw SKILL.md |
>           >
>           > ---
>           >
>           > ## 📖 Documentation
>           >
>           > - [SETUP.md](./SETUP.md) — Full installation, registration, API reference & troubleshooting
>           > - - [Releases](https://github.com/dariusX88/openclaw_workspace_skill/releases) — Changelog and release notes
>           >  
>           >   - ---
>           >
>           > ## 🤝 Contributing
>           >
>           > Issues, ideas, and pull requests are very welcome! This is an early release — if something doesn't work on your setup, please open an issue with your OS/Docker version and the error output.
>           >
>           > ---
>           >
>           > ## 📄 License
>           >
>           > [MIT](./LICENSE) — free to use, modify, and self-host.
