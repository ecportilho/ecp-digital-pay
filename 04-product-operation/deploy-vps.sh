#!/usr/bin/env bash
# ============================================================================
#  ECP Digital Pay — Instalador Automatico para VPS
#  Ubuntu 22.04 LTS | Bash 5+
#
#  USO:
#    1. Copie este script para o servidor:
#       scp deploy-vps.sh root@191.101.78.38:/root/
#
#    2. Execute no servidor:
#       ssh root@191.101.78.38
#       chmod +x /root/deploy-vps.sh
#       bash /root/deploy-vps.sh
#
#  O script e interativo — pede confirmacao antes de cada etapa critica.
#  Pode ser re-executado com seguranca (idempotente).
# ============================================================================

set -euo pipefail

# ============================================================================
# CONFIGURACAO
# ============================================================================
DOMAIN="pay.ecportilho.com"
APP_NAME="ecp-digital-pay"
REPO_DIR="/opt/ecp-digital-pay"
APP_DIR="/opt/ecp-digital-pay-app"
REPO_URL="https://github.com/ecportilho/ecp-digital-pay.git"
APP_PORT=3335
BANK_PORT=3333
EMPS_PORT=3334
NODE_VERSION="20"
CERTBOT_EMAIL=""

# ============================================================================
# CORES E FORMATACAO
# ============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

banner() {
    echo ""
    echo -e "${MAGENTA}======================================================================${NC}"
    echo -e "${BOLD}${MAGENTA}  $1${NC}"
    echo -e "${MAGENTA}======================================================================${NC}"
    echo ""
}

step() {
    echo ""
    echo -e "  ${BOLD}${CYAN}[$1]${NC} ${BOLD}$2${NC}"
    echo -e "  ${BLUE}$(printf '%0.s-' {1..60})${NC}"
}

info() {
    echo -e "      ${BLUE}INFO${NC}  $1"
}

ok() {
    echo -e "      ${GREEN}OK${NC}    $1"
}

warn() {
    echo -e "      ${YELLOW}AVISO${NC} $1"
}

fail() {
    echo -e "      ${RED}ERRO${NC}  $1"
}

ask_yes_no() {
    local prompt="$1"
    local default="${2:-s}"
    local yn
    if [ "$default" = "s" ]; then
        read -rp "      $prompt [S/n]: " yn
        yn="${yn:-s}"
    else
        read -rp "      $prompt [s/N]: " yn
        yn="${yn:-n}"
    fi
    case "$yn" in
        [sS]|[yY]) return 0 ;;
        *) return 1 ;;
    esac
}

ask_input() {
    local prompt="$1"
    local default="${2:-}"
    local value
    if [ -n "$default" ]; then
        read -rp "      $prompt [$default]: " value
        echo "${value:-$default}"
    else
        read -rp "      $prompt: " value
        echo "$value"
    fi
}

check_command() {
    command -v "$1" &> /dev/null
}

# ============================================================================
# INICIO
# ============================================================================
banner "ECP Digital Pay — Instalador VPS"

echo -e "  ${BOLD}Produto:${NC}  Servico centralizado de pagamentos do ecossistema ECP"
echo -e "  ${BOLD}Dominio:${NC}  https://${DOMAIN}"
echo -e "  ${BOLD}App Dir:${NC}  ${APP_DIR}"
echo -e "  ${BOLD}Porta:${NC}    ${APP_PORT}"
echo ""

if [ "$(id -u)" -ne 0 ]; then
    fail "Este script precisa ser executado como root."
    fail "Execute: sudo bash $0"
    exit 1
fi

# ============================================================================
# ETAPA 1: Coletar informacoes
# ============================================================================
step "1/12" "Coletar informacoes"

CERTBOT_EMAIL=$(ask_input "Email para o certificado SSL (Let's Encrypt)" "ecportilho@gmail.com")

echo ""
info "Integracoes com outros apps na mesma VPS:"
info "  ecp-digital-bank: porta ${BANK_PORT}"
info "  ecp-digital-emps: porta ${EMPS_PORT}"

BANK_PLATFORM_EMAIL=$(ask_input "Email da conta de servico no banco" "platform@ecpay.dev")
BANK_PLATFORM_PASSWORD=$(ask_input "Senha da conta de servico no banco" "EcpPay@Platform#2026")
EMPS_WEBHOOK_SECRET=$(ask_input "Segredo do webhook para ecp-emps" "ecp-pay-webhook-$(openssl rand -hex 8)")

echo ""
info "Configuracoes coletadas:"
info "  Repo:           ${REPO_URL}"
info "  Email SSL:      ${CERTBOT_EMAIL}"
info "  Banco (bank):   ${BANK_PLATFORM_EMAIL} na porta ${BANK_PORT}"
info "  Webhook (emps): porta ${EMPS_PORT}"
echo ""

if ! ask_yes_no "Prosseguir com a instalacao?"; then
    echo ""
    warn "Instalacao cancelada."
    exit 0
fi

# ============================================================================
# ETAPA 2: Atualizar sistema e instalar dependencias
# ============================================================================
step "2/12" "Atualizar sistema e instalar dependencias"

info "Atualizando pacotes do sistema..."
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
        warn "Node.js $(node -v) encontrado, mas precisa da v${NODE_VERSION}+"
        info "Instalando Node.js ${NODE_VERSION}..."
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
if check_command pm2; then
    ok "PM2 $(pm2 -v) ja instalado"
else
    info "Instalando PM2..."
    npm install -g pm2 > /dev/null 2>&1
    ok "PM2 $(pm2 -v) instalado"
fi

# Nginx
if check_command nginx; then
    ok "Nginx ja instalado"
else
    info "Instalando Nginx..."
    apt install -y -qq nginx > /dev/null 2>&1
    systemctl enable nginx > /dev/null 2>&1
    systemctl start nginx
    ok "Nginx instalado e iniciado"
fi

# Certbot
if check_command certbot; then
    ok "Certbot ja instalado"
else
    info "Instalando Certbot..."
    apt install -y -qq certbot python3-certbot-nginx > /dev/null 2>&1
    ok "Certbot instalado"
fi

# ============================================================================
# ETAPA 3: Clonar repositorio
# ============================================================================
step "3/12" "Clonar repositorio"

if [ -d "$REPO_DIR/.git" ]; then
    info "Repositorio ja existe em ${REPO_DIR}. Atualizando..."
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
# ETAPA 4: Copiar para diretorio de producao
# ============================================================================
step "4/12" "Preparar diretorio de producao"

mkdir -p "$APP_DIR"

info "Copiando arquivos da aplicacao..."
cp -r "$REPO_DIR/03-product-delivery/server" "$APP_DIR/"
cp -r "$REPO_DIR/03-product-delivery/web" "$APP_DIR/"
cp "$REPO_DIR/03-product-delivery/package.json" "$APP_DIR/"
cp "$REPO_DIR/03-product-delivery/package-lock.json" "$APP_DIR/" 2>/dev/null || true
cp "$REPO_DIR/03-product-delivery/tsconfig.base.json" "$APP_DIR/"
cp "$REPO_DIR/03-product-delivery/.env.example" "$APP_DIR/" 2>/dev/null || true

ok "Arquivos copiados para ${APP_DIR}"

# ============================================================================
# ETAPA 5: Instalar dependencias
# ============================================================================
step "5/12" "Instalar dependencias"

info "Instalando dependencias (npm workspaces: raiz + server + web)..."
cd "$APP_DIR"
npm install 2>&1 | tail -3
ok "Todas as dependencias instaladas"

# Verificar better-sqlite3
if [ -f "$APP_DIR/node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
    ok "better-sqlite3 compilado com sucesso"
else
    warn "better-sqlite3 binario nao encontrado — tentando recompilar..."
    cd "$APP_DIR"
    npm rebuild better-sqlite3 2>&1 | tail -3
    if [ -f "$APP_DIR/node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
        ok "better-sqlite3 recompilado"
    else
        fail "better-sqlite3 falhou! Verifique build-essential e python3."
    fi
fi

# ============================================================================
# ETAPA 6: Build do frontend
# ============================================================================
step "6/12" "Build do frontend (Vite)"

cd "$APP_DIR/web"
npm run build 2>&1 | tail -3
ok "Build concluido"

if [ ! -f "$APP_DIR/web/dist/index.html" ]; then
    fail "Build falhou — index.html nao encontrado!"
    exit 1
fi
ok "Frontend pronto em ${APP_DIR}/web/dist/"

# ============================================================================
# ETAPA 7: Configurar .env
# ============================================================================
step "7/12" "Configurar variaveis de ambiente"

JWT_SECRET=$(openssl rand -hex 32)

if [ -f "$APP_DIR/.env" ]; then
    warn "Arquivo .env ja existe. Mantendo o existente."
    info "Para recriar, delete $APP_DIR/.env e execute o script novamente."
else
    cat > "$APP_DIR/.env" << ENVFILE
# ================================================================
# ECP Digital Pay — Variaveis de Ambiente (PRODUCAO)
# Gerado automaticamente em $(date '+%Y-%m-%d %H:%M:%S')
# ================================================================

# Servidor
NODE_ENV=production
PORT=${APP_PORT}
HOST=127.0.0.1

# JWT (painel admin)
JWT_SECRET=${JWT_SECRET}

# Banco de dados
DATABASE_PATH=./database-pay.sqlite

# CORS
CORS_ORIGIN=https://${DOMAIN}

# Provider
PAYMENT_PROVIDER=internal

# Asaas (quando for para producao real, preencha)
ASAAS_API_KEY=
ASAAS_SANDBOX=true
ASAAS_WEBHOOK_TOKEN=

# Modo INTERNAL
INTERNAL_SIMULATION_DELAY=3000
INTERNAL_AUTO_APPROVE_CARDS=true
INTERNAL_MAX_SIMULATED_AMOUNT=10000000

# Integracao ecp-digital-emps (mesma VPS)
ECP_EMPS_WEBHOOK_URL=http://127.0.0.1:${EMPS_PORT}/webhooks/payment-received
ECP_EMPS_WEBHOOK_SECRET=${EMPS_WEBHOOK_SECRET}

# Integracao ecp-digital-bank (mesma VPS)
ECP_BANK_API_URL=http://127.0.0.1:${BANK_PORT}
ECP_BANK_PLATFORM_EMAIL=${BANK_PLATFORM_EMAIL}
ECP_BANK_PLATFORM_PASSWORD=${BANK_PLATFORM_PASSWORD}

# Frontend
VITE_API_URL=https://${DOMAIN}
ENVFILE

    chmod 600 "$APP_DIR/.env"
    ok ".env criado com segredo JWT unico"
fi

# ============================================================================
# ETAPA 8: Seed do banco de dados
# ============================================================================
step "8/12" "Seed do banco de dados"

if [ -f "$APP_DIR/database-pay.sqlite" ]; then
    if ask_yes_no "Banco ja existe. Recriar? (APAGA DADOS)" "n"; then
        rm -f "$APP_DIR/database-pay.sqlite" "$APP_DIR/database-pay.sqlite-wal" "$APP_DIR/database-pay.sqlite-shm"
        info "Banco removido. Recriando..."
    else
        warn "Mantendo banco existente. Pulando seed."
        SKIP_SEED=1
    fi
fi

if [ -z "${SKIP_SEED:-}" ]; then
    cd "$APP_DIR"
    npx tsx server/src/database/seed.ts 2>&1 | tail -5
    ok "Banco populado (admin: admin@ecpay.dev / Admin@123)"
fi

# ============================================================================
# ETAPA 9: Configurar e iniciar PM2
# ============================================================================
step "9/12" "Configurar PM2"

# Criar ecosystem config
cat > "$APP_DIR/ecosystem.config.cjs" << 'PMCONF'
module.exports = {
  apps: [{
    name: 'ecp-digital-pay',
    script: 'node_modules/.bin/tsx',
    args: 'server/src/server.ts',
    cwd: '/opt/ecp-digital-pay-app',
    instances: 1,
    exec_mode: 'fork',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3335,
      HOST: '127.0.0.1',
    },
    max_memory_restart: '512M',
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000,
    kill_timeout: 5000,
    listen_timeout: 10000,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    cron_restart: '0 4 * * *',
  }]
};
PMCONF

# Parar instancia anterior se existir
pm2 delete "$APP_NAME" 2>/dev/null || true

cd "$APP_DIR"
NODE_ENV=production pm2 start ecosystem.config.cjs --env production
ok "Aplicacao iniciada com PM2"

# Verificar que esta rodando
sleep 5
if pm2 pid "$APP_NAME" > /dev/null 2>&1; then
    ok "PM2 status: online"
else
    fail "PM2 nao conseguiu iniciar a aplicacao!"
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

# Salvar e configurar startup
pm2 save > /dev/null 2>&1
pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true
ok "PM2 configurado para iniciar no boot"

# ============================================================================
# ETAPA 10: Configurar Nginx (HTTP temporario)
# ============================================================================
step "10/12" "Configurar Nginx"

info "Criando configuracao HTTP temporaria (para gerar SSL)..."

cat > /etc/nginx/sites-available/ecp-digital-pay << 'NGINX_TEMP'
upstream ecp_pay_backend {
    server 127.0.0.1:3335;
    keepalive 16;
}

server {
    listen 80;
    listen [::]:80;
    server_name pay.ecportilho.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Payment API
    location /pay/ {
        proxy_pass http://ecp_pay_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
    }

    # Admin API
    location /admin/ {
        proxy_pass http://ecp_pay_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
    }

    # Static assets
    location /assets/ {
        alias /opt/ecp-digital-pay-app/web/dist/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # SPA fallback
    location / {
        root /opt/ecp-digital-pay-app/web/dist;
        try_files $uri $uri/ /index.html;
    }

    access_log /var/log/nginx/ecp-digital-pay-access.log;
    error_log /var/log/nginx/ecp-digital-pay-error.log;
}
NGINX_TEMP

ln -sf /etc/nginx/sites-available/ecp-digital-pay /etc/nginx/sites-enabled/ecp-digital-pay

if nginx -t 2>&1 | grep -q "successful"; then
    systemctl reload nginx
    ok "Nginx configurado e recarregado (HTTP)"
else
    fail "Configuracao do Nginx invalida!"
    nginx -t
    exit 1
fi

# ============================================================================
# ETAPA 11: Certificado SSL (Let's Encrypt)
# ============================================================================
step "11/12" "Certificado SSL (Let's Encrypt)"

info "Verificando DNS de ${DOMAIN}..."
RESOLVED_IP=$(dig +short "$DOMAIN" 2>/dev/null | head -1)
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "unknown")

if [ "$RESOLVED_IP" = "$SERVER_IP" ]; then
    ok "DNS OK: ${DOMAIN} -> ${RESOLVED_IP}"
else
    warn "DNS aponta para '${RESOLVED_IP}', IP deste servidor e '${SERVER_IP}'"
    warn "Se o DNS ainda nao propagou, o SSL vai falhar."
    if ! ask_yes_no "Tentar gerar o certificado mesmo assim?" "n"; then
        warn "Pulando SSL. Execute depois:"
        echo ""
        echo "      certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m ${CERTBOT_EMAIL}"
        echo ""
        SKIP_SSL=1
    fi
fi

if [ -z "${SKIP_SSL:-}" ]; then
    if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
        ok "Certificado SSL ja existe para ${DOMAIN}"
    else
        info "Gerando certificado SSL..."
        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL"

        if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
            ok "Certificado SSL gerado com sucesso"
        else
            fail "Falha ao gerar certificado SSL"
            warn "Verifique se o DNS esta propagado: dig ${DOMAIN} +short"
            SKIP_SSL=1
        fi
    fi
fi

# ============================================================================
# ETAPA 12: Verificacao final
# ============================================================================
step "12/12" "Verificacao final"

ERRORS=0

# PM2
if pm2 pid "$APP_NAME" > /dev/null 2>&1; then
    ok "PM2: ${APP_NAME} esta online"
else
    fail "PM2: ${APP_NAME} nao esta rodando"
    ERRORS=$((ERRORS + 1))
fi

# API Health
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${APP_PORT}/pay/health" 2>/dev/null || echo "000")
if [ "$HEALTH" = "200" ]; then
    ok "API: respondendo na porta ${APP_PORT}"
else
    fail "API: nao respondeu (HTTP ${HEALTH})"
    ERRORS=$((ERRORS + 1))
fi

# Banco de dados
if [ -f "$APP_DIR/database-pay.sqlite" ]; then
    DB_SIZE=$(du -h "$APP_DIR/database-pay.sqlite" | cut -f1)
    ok "Banco: database-pay.sqlite (${DB_SIZE})"
else
    fail "Banco: database-pay.sqlite nao encontrado"
    ERRORS=$((ERRORS + 1))
fi

# Frontend build
if [ -f "$APP_DIR/web/dist/index.html" ]; then
    ok "Frontend: build presente em web/dist/"
else
    fail "Frontend: build nao encontrado"
    ERRORS=$((ERRORS + 1))
fi

# Nginx
if systemctl is-active --quiet nginx; then
    ok "Nginx: rodando"
else
    fail "Nginx: parado"
    ERRORS=$((ERRORS + 1))
fi

# HTTP externo
EXTERNAL_HTTP=$(curl -s -o /dev/null -w "%{http_code}" "http://${DOMAIN}/pay/health" 2>/dev/null || echo "000")
if [ "$EXTERNAL_HTTP" = "200" ] || [ "$EXTERNAL_HTTP" = "301" ]; then
    ok "HTTP externo: ${DOMAIN} acessivel"
else
    warn "HTTP externo: ${DOMAIN} retornou ${EXTERNAL_HTTP}"
fi

# HTTPS
if [ -z "${SKIP_SSL:-}" ] && [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    EXTERNAL_HTTPS=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/pay/health" 2>/dev/null || echo "000")
    if [ "$EXTERNAL_HTTPS" = "200" ]; then
        ok "HTTPS: ${DOMAIN} com SSL ativo"
    else
        warn "HTTPS: retornou ${EXTERNAL_HTTPS}"
    fi
fi

# Integracao com banco
BANK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${BANK_PORT}/health" 2>/dev/null || echo "000")
if [ "$BANK_STATUS" = "200" ]; then
    ok "ECP Digital Bank: acessivel na porta ${BANK_PORT}"
else
    warn "ECP Digital Bank: nao respondeu na porta ${BANK_PORT} (pode nao estar rodando)"
fi

# Integracao com emps
EMPS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${EMPS_PORT}/health" 2>/dev/null || echo "000")
if [ "$EMPS_STATUS" = "200" ]; then
    ok "ECP Digital Emps: acessivel na porta ${EMPS_PORT}"
else
    warn "ECP Digital Emps: nao respondeu na porta ${EMPS_PORT} (pode nao estar rodando)"
fi

# Login admin
ADMIN_LOGIN=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:${APP_PORT}/admin/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@ecpay.dev","password":"Admin@123"}' 2>/dev/null || echo "000")
if [ "$ADMIN_LOGIN" = "200" ]; then
    ok "Admin login: admin@ecpay.dev OK"
else
    warn "Admin login: retornou ${ADMIN_LOGIN}"
fi

# ============================================================================
# RESULTADO FINAL
# ============================================================================
banner "Resultado Final"

if [ "$ERRORS" -eq 0 ]; then
    echo -e "  ${GREEN}${BOLD}INSTALACAO CONCLUIDA COM SUCESSO!${NC}"
else
    echo -e "  ${YELLOW}${BOLD}INSTALACAO CONCLUIDA COM ${ERRORS} AVISO(S)${NC}"
fi

echo ""
echo -e "  ${BOLD}Acesse:${NC}"
if [ -z "${SKIP_SSL:-}" ] && [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    echo -e "    Painel Admin:  ${GREEN}https://${DOMAIN}${NC}"
    echo -e "    Health Check:  ${GREEN}https://${DOMAIN}/pay/health${NC}"
else
    echo -e "    Painel Admin:  ${GREEN}http://${DOMAIN}${NC}"
    echo -e "    Health Check:  ${GREEN}http://${DOMAIN}/pay/health${NC}"
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
echo -e "    pm2 status                        # Ver status"
echo -e "    pm2 logs ecp-digital-pay           # Ver logs"
echo -e "    pm2 reload ecp-digital-pay         # Reiniciar"
echo ""
echo -e "  ${BOLD}Redeploy (atualizar codigo):${NC}"
echo -e "    cd ${REPO_DIR} && git pull origin main"
echo -e "    cp -r 03-product-delivery/server ${APP_DIR}/"
echo -e "    cp -r 03-product-delivery/web/src ${APP_DIR}/web/"
echo -e "    cd ${APP_DIR}/web && npm run build"
echo -e "    pm2 reload ecp-digital-pay"
echo ""
echo -e "${MAGENTA}======================================================================${NC}"
echo -e "${BOLD}${MAGENTA}  ECP Digital Pay — Instalacao finalizada!${NC}"
echo -e "${MAGENTA}======================================================================${NC}"
echo ""
