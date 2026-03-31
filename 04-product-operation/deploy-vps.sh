#!/usr/bin/env bash
# ============================================================================
#  ECP Digital Pay — Deploy VPS (Padronizado)
#  Ubuntu 22.04+ | Bash 5+
#
#  USO:
#    scp deploy-vps.sh root@<IP>:/root/deploy-pay.sh
#    ssh root@<IP>
#    chmod +x /root/deploy-pay.sh && bash /root/deploy-pay.sh
#
#  Idempotente — pode ser re-executado com seguranca.
# ============================================================================

set -euo pipefail

# ============================================================================
# CONFIGURACAO
# ============================================================================
DOMAIN="pay.ecportilho.com"
APP_NAME="ecp-digital-pay"
REPO_URL="https://github.com/ecportilho/ecp-digital-pay.git"
REPO_DIR="/opt/ecp-digital-pay"
APP_CWD="/opt/ecp-digital-pay/03-product-delivery"
APP_PORT=3335
NODE_VERSION="20"

# ============================================================================
# CORES E FORMATACAO
# ============================================================================
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; MAGENTA='\033[0;35m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'

banner() { echo ""; echo -e "${MAGENTA}======================================================================${NC}"; echo -e "${BOLD}${MAGENTA}  $1${NC}"; echo -e "${MAGENTA}======================================================================${NC}"; echo ""; }
step()   { echo ""; echo -e "  ${BOLD}${CYAN}[$1]${NC} ${BOLD}$2${NC}"; echo -e "  ${BLUE}$(printf '%0.s-' {1..60})${NC}"; }
info()   { echo -e "      ${BLUE}INFO${NC}  $1"; }
ok()     { echo -e "      ${GREEN}OK${NC}    $1"; }
warn()   { echo -e "      ${YELLOW}AVISO${NC} $1"; }
fail()   { echo -e "      ${RED}ERRO${NC}  $1"; }

ask_yes_no() {
    local prompt="$1" default="${2:-s}" yn
    if [ "$default" = "s" ]; then read -rp "      $prompt [S/n]: " yn; yn="${yn:-s}"
    else read -rp "      $prompt [s/N]: " yn; yn="${yn:-n}"; fi
    case "$yn" in [sS]|[yY]) return 0 ;; *) return 1 ;; esac
}
ask_input() {
    local prompt="$1" default="${2:-}" value
    if [ -n "$default" ]; then read -rp "      $prompt [$default]: " value; echo "${value:-$default}"
    else read -rp "      $prompt: " value; echo "$value"; fi
}
check_command() { command -v "$1" &>/dev/null; }

# ============================================================================
# INICIO
# ============================================================================
banner "ECP Digital Pay — Deploy VPS"

echo -e "  ${BOLD}Dominio:${NC}  https://${DOMAIN}"
echo -e "  ${BOLD}Repo:${NC}     ${REPO_DIR}"
echo -e "  ${BOLD}App CWD:${NC}  ${APP_CWD}"
echo -e "  ${BOLD}Porta:${NC}    ${APP_PORT}"
echo ""

[ "$(id -u)" -ne 0 ] && { fail "Execute como root."; exit 1; }

# ============================================================================
# ETAPA 1: Coletar informacoes
# ============================================================================
step "1/12" "Coletar informacoes"

CERTBOT_EMAIL=$(ask_input "Email SSL (Let's Encrypt)" "ecportilho@gmail.com")

echo ""
info "Integracoes com outros apps na mesma VPS:"
info "  ecp-digital-bank: porta 3333"
info "  ecp-digital-emps: porta 3334"

EMPS_WEBHOOK_SECRET=$(ask_input "Segredo do webhook para ecp-emps" "ecp-pay-webhook-secret-dev")
BANK_PLATFORM_PASSWORD=$(ask_input "Senha da conta de servico no banco (platform@ecpay.dev)" "EcpPay@Platform#2026")

echo ""
info "Repo:           ${REPO_URL}"
info "Email SSL:      ${CERTBOT_EMAIL}"
info "Webhook emps:   ${EMPS_WEBHOOK_SECRET:0:10}..."
echo ""
ask_yes_no "Prosseguir?" || { warn "Cancelado."; exit 0; }

# ============================================================================
# ETAPA 2: Instalar dependencias do sistema
# ============================================================================
step "2/12" "Instalar dependencias do sistema"

info "Atualizando pacotes..."
apt update -qq && apt upgrade -y -qq
ok "Sistema atualizado"

info "Instalando ferramentas de build..."
apt install -y -qq build-essential python3 curl git > /dev/null 2>&1
ok "build-essential, python3, curl, git"

# Node.js
if check_command node; then
    CURRENT_NODE=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$CURRENT_NODE" -ge "$NODE_VERSION" ]; then
        ok "Node.js $(node -v) ja instalado"
    else
        info "Atualizando Node.js..."
        curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - > /dev/null 2>&1
        apt install -y -qq nodejs > /dev/null 2>&1
        ok "Node.js $(node -v) instalado"
    fi
else
    info "Instalando Node.js ${NODE_VERSION}..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - > /dev/null 2>&1
    apt install -y -qq nodejs > /dev/null 2>&1
    ok "Node.js $(node -v) instalado"
fi

# PM2
check_command pm2 && ok "PM2 $(pm2 -v)" || { npm install -g pm2 > /dev/null 2>&1; ok "PM2 $(pm2 -v) instalado"; }

# tsx (global) — set EARLY
check_command tsx && ok "tsx ja instalado" || { npm install -g tsx > /dev/null 2>&1; ok "tsx instalado"; }
TSX_PATH=$(which tsx)
info "TSX_PATH=${TSX_PATH}"

# Nginx
check_command nginx && ok "Nginx ja instalado" || { apt install -y -qq nginx > /dev/null 2>&1; systemctl enable nginx > /dev/null 2>&1; systemctl start nginx; ok "Nginx instalado"; }

# Certbot
check_command certbot && ok "Certbot ja instalado" || { apt install -y -qq certbot python3-certbot-nginx > /dev/null 2>&1; ok "Certbot instalado"; }

# ============================================================================
# ETAPA 3: Clonar/atualizar repositorio
# ============================================================================
step "3/12" "Clonar repositorio"

if [ -d "$REPO_DIR/.git" ]; then
    info "Repositorio ja existe. Atualizando..."
    cd "$REPO_DIR"
    git fetch origin
    git reset --hard origin/main 2>/dev/null || git reset --hard origin/master
    ok "Repositorio atualizado"
else
    info "Clonando de ${REPO_URL}..."
    git clone "$REPO_URL" "$REPO_DIR"
    ok "Repositorio clonado em ${REPO_DIR}"
fi

# ============================================================================
# ETAPA 4: Corrigir fontes para producao
# ============================================================================
step "4/12" "Corrigir fontes para producao"

# Garantir vite-env.d.ts existe
if [ ! -f "$APP_CWD/web/src/vite-env.d.ts" ]; then
    mkdir -p "$APP_CWD/web/src"
    echo '/// <reference types="vite/client" />' > "$APP_CWD/web/src/vite-env.d.ts"
    info "vite-env.d.ts criado"
fi

ok "Fontes prontas"

# ============================================================================
# ETAPA 5: Instalar dependencias
# ============================================================================
step "5/12" "Instalar dependencias"

info "Instalando dependencias (npm workspaces: raiz + server + web)..."
cd "$APP_CWD"
npm install 2>&1 | tail -3
ok "Todas as dependencias instaladas"

# Verificar better-sqlite3
if [ -f "$APP_CWD/node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
    ok "better-sqlite3 OK"
else
    warn "Recompilando better-sqlite3..."
    npm rebuild better-sqlite3 2>&1 | tail -3
fi

# ============================================================================
# ETAPA 6: Build do frontend
# ============================================================================
step "6/12" "Build do frontend (Vite)"

cd "$APP_CWD/web"

# Limpar cache e build antigo
rm -rf dist node_modules/.vite

info "Executando vite build..."
# workspaces: vite hoisted na raiz do APP_CWD
node "$APP_CWD/node_modules/vite/bin/vite.js" build 2>&1 | tail -5

if [ ! -f "$APP_CWD/web/dist/index.html" ]; then
    fail "Build falhou — index.html nao encontrado!"
    exit 1
fi

# Validar que nao ficou localhost no build
if grep -rq "localhost" "$APP_CWD/web/dist/assets/"*.js 2>/dev/null; then
    warn "localhost encontrado no build — verificar configuracao"
fi

ok "Frontend em web/dist/"

# ============================================================================
# ETAPA 7: Configurar .env
# ============================================================================
step "7/12" "Configurar variaveis de ambiente"

if [ -f "$APP_CWD/.env" ]; then
    warn ".env ja existe — mantendo o existente"
    info "Para recriar, delete $APP_CWD/.env e re-execute"
else
    JWT_SECRET=$(openssl rand -hex 32)

    echo "# ECP Digital Pay — PRODUCAO ($(date '+%Y-%m-%d %H:%M'))
NODE_ENV=production
PORT=${APP_PORT}
HOST=127.0.0.1
JWT_SECRET=${JWT_SECRET}
DATABASE_PATH=./database-pay.sqlite
CORS_ORIGIN=https://${DOMAIN}
PAYMENT_PROVIDER=internal
ASAAS_API_KEY=
ASAAS_SANDBOX=true
ASAAS_WEBHOOK_TOKEN=
INTERNAL_SIMULATION_DELAY=3000
INTERNAL_AUTO_APPROVE_CARDS=true
INTERNAL_MAX_SIMULATED_AMOUNT=10000000
ECP_EMPS_WEBHOOK_URL=http://127.0.0.1:3334/webhooks/payment-received
ECP_EMPS_WEBHOOK_SECRET=${EMPS_WEBHOOK_SECRET}
ECP_BANK_API_URL=http://127.0.0.1:3333
ECP_BANK_PLATFORM_EMAIL=platform@ecpay.dev
ECP_BANK_PLATFORM_PASSWORD=${BANK_PLATFORM_PASSWORD}
VITE_API_URL=https://${DOMAIN}" > "$APP_CWD/.env"

    chmod 600 "$APP_CWD/.env"
    ok ".env criado"
fi

# ============================================================================
# ETAPA 8: Banco de dados (auto-created + idempotent seed)
# ============================================================================
step "8/12" "Banco de dados"

SKIP_SEED=""
if [ -f "$APP_CWD/database-pay.sqlite" ]; then
    if ask_yes_no "Banco ja existe. Recriar? (APAGA DADOS)" "n"; then
        rm -f "$APP_CWD/database-pay.sqlite" "$APP_CWD/database-pay.sqlite-wal" "$APP_CWD/database-pay.sqlite-shm"
        info "Banco removido. Recriando..."
    else
        warn "Mantendo banco existente"
        SKIP_SEED=1
    fi
fi

if [ -z "$SKIP_SEED" ]; then
    cd "$APP_CWD"
    info "Seed (auto-creates tables + idempotent data)..."
    $TSX_PATH server/src/database/seed.ts 2>&1 | tail -5
    ok "Banco populado (admin: admin@ecpay.dev / Admin@123)"
fi

# ============================================================================
# ETAPA 9: PM2
# ============================================================================
step "9/12" "Configurar PM2"

pm2 delete "$APP_NAME" 2>/dev/null || true

echo "module.exports={apps:[{name:'${APP_NAME}',script:'${TSX_PATH}',args:'server/src/server.ts',cwd:'${APP_CWD}',instances:1,exec_mode:'fork',env_production:{NODE_ENV:'production',PORT:${APP_PORT},HOST:'127.0.0.1'},max_memory_restart:'512M',max_restarts:10,min_uptime:'10s',restart_delay:4000,kill_timeout:5000,listen_timeout:10000,log_date_format:'YYYY-MM-DD HH:mm:ss Z',merge_logs:true,cron_restart:'0 4 * * *'}]};" > "$APP_CWD/ecosystem.config.cjs"

cd "$APP_CWD"
NODE_ENV=production pm2 start ecosystem.config.cjs --env production
ok "Aplicacao iniciada com PM2"

sleep 5
if pm2 pid "$APP_NAME" > /dev/null 2>&1; then
    ok "PM2 status: online"
else
    fail "PM2 nao conseguiu iniciar!"
    pm2 logs "$APP_NAME" --lines 20 --nostream
    exit 1
fi

# Testar API
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${APP_PORT}/pay/health" 2>/dev/null || echo "000")
if [ "$HEALTH" = "200" ]; then
    ok "API respondendo na porta ${APP_PORT}"
    HEALTH_BODY=$(curl -s "http://127.0.0.1:${APP_PORT}/pay/health" 2>/dev/null)
    info "Health: ${HEALTH_BODY}"
else
    fail "API nao respondeu (HTTP ${HEALTH})"
    pm2 logs "$APP_NAME" --lines 20 --nostream
    exit 1
fi

pm2 save > /dev/null 2>&1
pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true
ok "PM2 configurado para iniciar no boot"

# ============================================================================
# ETAPA 10: Nginx
# ============================================================================
step "10/12" "Configurar Nginx"

info "Criando configuracao HTTP (para gerar SSL)..."

tee /etc/nginx/sites-available/${APP_NAME} > /dev/null << 'NGX'
upstream ecp_pay_backend {
    server 127.0.0.1:3335;
    keepalive 16;
}

server {
    listen 80;
    listen [::]:80;
    server_name pay.ecportilho.com;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 256;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Payment API (passthrough, no rewrite)
    location /pay/ {
        proxy_pass http://ecp_pay_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 30s;
    }

    # Admin API (passthrough, no rewrite)
    location /admin/ {
        proxy_pass http://ecp_pay_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        proxy_read_timeout 30s;
    }

    # Static assets (hashed, immutable)
    location /assets/ {
        alias /opt/ecp-digital-pay/03-product-delivery/web/dist/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # SPA fallback
    location / {
        root /opt/ecp-digital-pay/03-product-delivery/web/dist;
        try_files $uri $uri/ /index.html;
    }

    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    access_log /var/log/nginx/ecp-digital-pay-access.log;
    error_log /var/log/nginx/ecp-digital-pay-error.log;
}
NGX

ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/

if nginx -t 2>&1 | grep -q "successful"; then
    systemctl reload nginx
    ok "Nginx configurado (HTTP)"
else
    fail "Nginx config invalida!"
    nginx -t
    exit 1
fi

# ============================================================================
# ETAPA 11: SSL (Let's Encrypt)
# ============================================================================
step "11/12" "SSL (Let's Encrypt)"

SKIP_SSL=""
RESOLVED_IP=$(dig +short "$DOMAIN" 2>/dev/null | head -1)
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "unknown")

if [ "$RESOLVED_IP" = "$SERVER_IP" ]; then
    ok "DNS: ${DOMAIN} -> ${RESOLVED_IP}"
else
    warn "DNS: '${RESOLVED_IP}' vs servidor '${SERVER_IP}'"
    ask_yes_no "Tentar SSL mesmo assim?" "n" || SKIP_SSL=1
fi

if [ -z "$SKIP_SSL" ]; then
    if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
        ok "Certificado ja existe"
        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" 2>&1 | tail -3
        ok "SSL deployado no Nginx"
    else
        info "Gerando certificado SSL..."
        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL"
        [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ] && ok "SSL gerado" || { fail "SSL falhou"; SKIP_SSL=1; }
    fi
fi

# ============================================================================
# ETAPA 12: Verificacao final
# ============================================================================
step "12/12" "Verificacao final"

ERRORS=0

pm2 pid "$APP_NAME" > /dev/null 2>&1 && ok "PM2: online" || { fail "PM2: offline"; ERRORS=$((ERRORS+1)); }

H=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${APP_PORT}/pay/health" 2>/dev/null || echo "000")
[ "$H" = "200" ] && ok "API: porta ${APP_PORT}" || { fail "API: sem resposta (HTTP ${H})"; ERRORS=$((ERRORS+1)); }

[ -f "$APP_CWD/database-pay.sqlite" ] && ok "Banco: $(du -h "$APP_CWD/database-pay.sqlite" | cut -f1)" || { fail "Banco: nao encontrado"; ERRORS=$((ERRORS+1)); }
[ -f "$APP_CWD/web/dist/index.html" ] && ok "Frontend: build OK" || { fail "Frontend: sem build"; ERRORS=$((ERRORS+1)); }
systemctl is-active --quiet nginx && ok "Nginx: rodando" || { fail "Nginx: parado"; ERRORS=$((ERRORS+1)); }

EXT=$(curl -s -o /dev/null -w "%{http_code}" "http://${DOMAIN}/pay/health" 2>/dev/null || echo "000")
[ "$EXT" = "200" ] || [ "$EXT" = "301" ] && ok "HTTP externo: ${DOMAIN}" || warn "HTTP externo: retornou ${EXT}"

if [ -z "${SKIP_SSL:-}" ] && [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    EXTS=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/pay/health" 2>/dev/null || echo "000")
    [ "$EXTS" = "200" ] && ok "HTTPS: ${DOMAIN} OK" || warn "HTTPS: retornou ${EXTS}"
fi

# Integration checks
BANK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3333/health" 2>/dev/null || echo "000")
[ "$BANK_STATUS" = "200" ] && ok "ECP Digital Bank: acessivel" || warn "ECP Digital Bank: nao respondeu (pode nao estar rodando)"

EMPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3334/health" 2>/dev/null || echo "000")
[ "$EMPS_STATUS" = "200" ] && ok "ECP Digital Emps: acessivel" || warn "ECP Digital Emps: nao respondeu (pode nao estar rodando)"

# Admin login test
ADMIN_LOGIN=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:${APP_PORT}/admin/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@ecpay.dev","password":"Admin@123"}' 2>/dev/null || echo "000")
[ "$ADMIN_LOGIN" = "200" ] && ok "Admin login: admin@ecpay.dev OK" || warn "Admin login: retornou ${ADMIN_LOGIN}"

# ============================================================================
banner "Resultado"

[ "$ERRORS" -eq 0 ] && echo -e "  ${GREEN}${BOLD}INSTALACAO CONCLUIDA COM SUCESSO!${NC}" || echo -e "  ${YELLOW}${BOLD}INSTALACAO COM ${ERRORS} PROBLEMA(S)${NC}"

echo ""
if [ -z "${SKIP_SSL:-}" ] && [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    echo -e "  ${BOLD}Acesse:${NC}  ${GREEN}https://${DOMAIN}${NC}"
else
    echo -e "  ${BOLD}Acesse:${NC}  ${YELLOW}http://${DOMAIN}${NC}"
fi
echo ""
echo -e "  ${BOLD}Login do painel admin:${NC}"
echo -e "    Email:  ${CYAN}admin@ecpay.dev${NC}"
echo -e "    Senha:  ${CYAN}Admin@123${NC}"
echo ""
echo -e "  ${BOLD}API Keys dos apps:${NC}"
echo -e "    ecp-bank:  ${CYAN}ecp-bank-dev-key${NC}"
echo -e "    ecp-emps:  ${CYAN}ecp-emps-dev-key${NC}"
echo -e "    ecp-food:  ${CYAN}ecp-food-dev-key${NC}"
echo ""
echo -e "  ${BOLD}Provider:${NC} INTERNAL (simulacao local)"
echo ""
echo -e "  ${BOLD}Comandos uteis:${NC}"
echo -e "    pm2 status                          # Ver status"
echo -e "    pm2 logs ${APP_NAME}          # Ver logs"
echo -e "    pm2 reload ${APP_NAME}        # Reiniciar"
echo ""
echo -e "  ${BOLD}Redeploy:${NC}"
echo -e "    cd ${REPO_DIR} && git pull origin main"
echo -e "    cd ${APP_CWD}/web && rm -rf dist && ./node_modules/.bin/vite build"
echo -e "    pm2 reload ${APP_NAME}"
echo ""
echo -e "${MAGENTA}======================================================================${NC}"
echo ""
