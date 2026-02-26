#!/usr/bin/env bash
# ============================================================================
# OpenClaw Workspace Skill — Automated Installer
# Installs Docs, Tables, Calendar, File Storage & Web File Browser for OpenClaw
# ============================================================================
set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ── Config ──────────────────────────────────────────────────────────────────
REPO_URL="https://github.com/dariusX88/openclaw_workspace_skill.git"
INSTALL_DIR="/docker/openclaw_workspace_skill"
API_PORT=8082
DOCKER_BRIDGE_IP="172.17.0.1"

# ── Helpers ─────────────────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

banner() {
  echo -e "${CYAN}${BOLD}"
  echo "╔══════════════════════════════════════════════════╗"
  echo "║   OpenClaw Workspace Skill — Installer           ║"
  echo "║   Docs · Tables · Calendar · Files · Browser     ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

# ── Pre-flight checks ──────────────────────────────────────────────────────
preflight() {
  info "Running pre-flight checks..."

  command -v docker >/dev/null 2>&1 || error "Docker is not installed. Install Docker first."
  command -v git    >/dev/null 2>&1 || error "Git is not installed. Install Git first."

  # Check Docker Compose (v2 plugin or standalone)
  if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
  elif docker-compose version >/dev/null 2>&1; then
    COMPOSE="docker-compose"
  else
    error "Docker Compose is not installed."
  fi

  success "Docker, Git, and Docker Compose found"
}

# ── Find OpenClaw ───────────────────────────────────────────────────────────
find_openclaw() {
  info "Looking for OpenClaw container..."

  OPENCLAW_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i openclaw | grep -v workspace_skill | head -1)

  if [ -z "${OPENCLAW_CONTAINER}" ]; then
    warn "OpenClaw container not found (not running)."
    warn "The workspace API will be installed, but skill registration will be skipped."
    warn "Run this script again after starting OpenClaw, or register manually (see SETUP.md)."
    OPENCLAW_DATA=""
    return
  fi

  success "Found OpenClaw container: ${OPENCLAW_CONTAINER}"

  # Find the data mount
  OPENCLAW_DATA=$(docker inspect "${OPENCLAW_CONTAINER}" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || echo "")

  if [ -z "${OPENCLAW_DATA}" ]; then
    warn "Could not detect OpenClaw data directory."
    warn "Skill registration will be skipped. Register manually (see SETUP.md)."
    return
  fi

  success "OpenClaw data dir: ${OPENCLAW_DATA}"
}

# ── Clone or update repo ───────────────────────────────────────────────────
clone_repo() {
  if [ -d "${INSTALL_DIR}/.git" ]; then
    info "Repository already exists at ${INSTALL_DIR}. Pulling latest..."
    cd "${INSTALL_DIR}"
    git pull --ff-only || warn "Git pull failed — using existing code"
  else
    if [ -d "${INSTALL_DIR}" ]; then
      warn "${INSTALL_DIR} exists but is not a git repo. Backing up..."
      mv "${INSTALL_DIR}" "${INSTALL_DIR}.bak.$(date +%s)"
    fi
    info "Cloning repository..."
    git clone "${REPO_URL}" "${INSTALL_DIR}"
    cd "${INSTALL_DIR}"
  fi

  success "Repository ready at ${INSTALL_DIR}"
}

# ── Generate tokens ────────────────────────────────────────────────────────
generate_env() {
  cd "${INSTALL_DIR}"

  if [ -f .env ]; then
    info "Existing .env found — keeping current tokens"
    source .env 2>/dev/null || true
    SVC_TOKEN="${WORKSPACE_SERVICE_TOKEN:-}"
    if [ -z "${SVC_TOKEN}" ]; then
      warn ".env exists but WORKSPACE_SERVICE_TOKEN is empty. Regenerating..."
    else
      success "Using existing tokens from .env"
      return
    fi
  fi

  info "Generating secure tokens..."
  DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
  SVC_TOKEN="wsk_$(openssl rand -base64 36 | tr -d '/+=' | head -c 40)"

  cat > .env << EOF
DB_PASSWORD=${DB_PASS}
WORKSPACE_SERVICE_TOKEN=${SVC_TOKEN}
EOF

  success "Tokens generated and saved to .env"
  echo -e "  ${CYAN}DB_PASSWORD:${NC}              ${DB_PASS}"
  echo -e "  ${CYAN}WORKSPACE_SERVICE_TOKEN:${NC}  ${SVC_TOKEN}"
  echo -e "  ${YELLOW}Save these somewhere safe!${NC}"
}

# ── Build and start stack ──────────────────────────────────────────────────
start_stack() {
  cd "${INSTALL_DIR}"

  info "Building Docker images..."
  ${COMPOSE} build --no-cache

  info "Starting services..."
  ${COMPOSE} up -d

  success "Docker stack started"
}

# ── Run migrations ─────────────────────────────────────────────────────────
run_migrations() {
  cd "${INSTALL_DIR}"

  info "Waiting for Postgres to be ready..."

  # Poll Postgres readiness (up to 30 seconds)
  for i in $(seq 1 30); do
    if ${COMPOSE} exec -T db pg_isready -U workspace -d workspace >/dev/null 2>&1; then
      break
    fi
    if [ "$i" -eq 30 ]; then
      error "Postgres did not become ready in 30 seconds. Check: ${COMPOSE} logs db"
    fi
    sleep 1
  done

  success "Postgres is ready"

  info "Running database migrations..."
  ${COMPOSE} exec -T db psql -U workspace -d workspace < migrations/001_init.sql

  success "Database schema created (11 tables)"
}

# ── Health check ───────────────────────────────────────────────────────────
health_check() {
  info "Checking API health..."

  for i in $(seq 1 10); do
    HEALTH=$(curl -sf "http://127.0.0.1:${API_PORT}/health" 2>/dev/null || echo "")
    if [ "${HEALTH}" = '{"ok":true}' ]; then
      success "API is healthy: ${HEALTH}"
      return
    fi
    sleep 1
  done

  error "API health check failed after 10 seconds. Check: ${COMPOSE} logs api"
}

# ── Install OpenClaw skill ─────────────────────────────────────────────────
install_skill() {
  if [ -z "${OPENCLAW_DATA:-}" ]; then
    warn "Skipping skill installation (OpenClaw not found)"
    return
  fi

  cd "${INSTALL_DIR}"

  # Read the token
  source .env 2>/dev/null || true
  SVC_TOKEN="${WORKSPACE_SERVICE_TOKEN}"

  info "Installing SKILL.md into OpenClaw..."

  # Create skill directory
  mkdir -p "${OPENCLAW_DATA}/.openclaw/skills/workspace"

  # Detect VPS public IP for dashboard URL (user opens this in their browser)
  VPS_IP=$(curl -sf --max-time 3 https://ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
  DASHBOARD_URL="http://${VPS_IP}:${API_PORT}/browser"

  # Copy SKILL.md with token, API IP, and dashboard URL substitution
  sed "s|http://localhost:8082|http://${DOCKER_BRIDGE_IP}:${API_PORT}|g; s|{{WORKSPACE_SERVICE_TOKEN}}|${SVC_TOKEN}|g; s|{{DASHBOARD_URL}}|${DASHBOARD_URL}|g" \
    packages/openclaw-skill/SKILL.md > "${OPENCLAW_DATA}/.openclaw/skills/workspace/SKILL.md"

  success "SKILL.md installed"

  # Register in openclaw.json
  info "Registering skill in OpenClaw config..."

  OPENCLAW_CONFIG="${OPENCLAW_DATA}/.openclaw/openclaw.json"

  if [ -f "${OPENCLAW_CONFIG}" ]; then
    python3 -c "
import json
with open('${OPENCLAW_CONFIG}') as f:
    cfg = json.load(f)
if 'skills' not in cfg:
    cfg['skills'] = {'entries': {}}
if 'entries' not in cfg['skills']:
    cfg['skills']['entries'] = {}
if 'workspace' not in cfg['skills']['entries']:
    cfg['skills']['entries']['workspace'] = {'enabled': True}
    with open('${OPENCLAW_CONFIG}', 'w') as f:
        json.dump(cfg, f, indent=2)
    print('Registered workspace skill')
else:
    print('Workspace skill already registered')
" 2>/dev/null || warn "Could not update openclaw.json (python3 required). Register manually."
  else
    warn "openclaw.json not found at ${OPENCLAW_CONFIG}. Register manually (see SETUP.md)."
  fi

  # Restart OpenClaw
  info "Restarting OpenClaw..."
  docker restart "${OPENCLAW_CONTAINER}" >/dev/null 2>&1

  sleep 5

  # Check startup
  if docker logs "${OPENCLAW_CONTAINER}" --tail 3 2>&1 | grep -q "Starting OpenClaw gateway"; then
    success "OpenClaw restarted successfully"
  elif docker logs "${OPENCLAW_CONTAINER}" --tail 5 2>&1 | grep -qi "error\|invalid"; then
    warn "OpenClaw may have startup issues. Check: docker logs ${OPENCLAW_CONTAINER} --tail 20"
  else
    success "OpenClaw restarted"
  fi
}

# ── Test the API ───────────────────────────────────────────────────────────
test_api() {
  cd "${INSTALL_DIR}"
  source .env 2>/dev/null || true
  SVC_TOKEN="${WORKSPACE_SERVICE_TOKEN}"

  info "Testing workspace creation..."

  RESULT=$(curl -sf -X POST "http://127.0.0.1:${API_PORT}/workspaces" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${SVC_TOKEN}" \
    -d '{"name": "InstallerTest"}' 2>/dev/null || echo "FAILED")

  if echo "${RESULT}" | grep -q '"id"'; then
    success "Workspace created: ${RESULT}"

    # Clean up test workspace? No — leave it as proof.
    info "Test workspace 'InstallerTest' left in DB for verification"
  else
    warn "Could not create test workspace. API response: ${RESULT}"
    warn "Check API logs: ${COMPOSE} -f ${INSTALL_DIR}/docker-compose.yml logs api"
  fi
}

# ── Summary ────────────────────────────────────────────────────────────────
summary() {
  echo ""
  echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}${BOLD}  Installation Complete!${NC}"
  echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════${NC}"
  echo ""
  # Detect external IP
  VPS_IP=$(curl -sf --max-time 3 https://ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "YOUR_VPS_IP")

  echo -e "  ${BOLD}API Endpoint:${NC}      http://127.0.0.1:${API_PORT}"
  echo -e "  ${BOLD}Health Check:${NC}      http://127.0.0.1:${API_PORT}/health"
  echo -e "  ${BOLD}File Browser:${NC}      ${CYAN}http://${VPS_IP}:${API_PORT}/browser${NC}"
  echo -e "  ${BOLD}Install Dir:${NC}       ${INSTALL_DIR}"
  echo -e "  ${BOLD}Tokens:${NC}            ${INSTALL_DIR}/.env"

  if [ -n "${OPENCLAW_DATA:-}" ]; then
    echo -e "  ${BOLD}Skill Location:${NC}    ${OPENCLAW_DATA}/.openclaw/skills/workspace/SKILL.md"
    echo ""
    echo -e "  ${YELLOW}${BOLD}IMPORTANT:${NC} Open a ${BOLD}new conversation${NC} in the OpenClaw UI."
    echo -e "  Skills only load in new chat sessions."
    echo ""
    echo -e "  ${BOLD}Try asking OpenClaw:${NC}"
    echo -e "  ${CYAN}\"Use the workspace skill to create a workspace called HelloWorld\"${NC}"
  else
    echo ""
    echo -e "  ${YELLOW}OpenClaw skill not installed (container not found).${NC}"
    echo -e "  See SETUP.md for manual registration."
  fi

  echo ""
  echo -e "  ${BOLD}File Browser:${NC}      Open ${CYAN}http://${VPS_IP}:${API_PORT}/browser${NC} in your browser"
  echo -e "                     Log in with your WORKSPACE_SERVICE_TOKEN"
  echo -e "                     Upload, download, and manage files from any device"
  echo ""
  echo -e "  ${BOLD}Documentation:${NC}     ${INSTALL_DIR}/SETUP.md"
  echo -e "  ${BOLD}Troubleshooting:${NC}   ${INSTALL_DIR}/SETUP.md#troubleshooting"
  echo ""
}

# ── Main ───────────────────────────────────────────────────────────────────
main() {
  banner
  preflight
  find_openclaw
  clone_repo
  generate_env
  start_stack
  run_migrations
  health_check
  install_skill
  test_api
  summary
}

main "$@"
