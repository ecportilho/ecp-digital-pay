# ============================================================================
#  ECP Pay v1.0  -  Script de Instalacao Completo
#  Windows 11 | PowerShell 5.1+
#  Executar: PowerShell -ExecutionPolicy Bypass -File .\ecp-digital-pay-install.ps1
# ============================================================================

# --- Configuracao ---
$ErrorActionPreference = "Continue"
$HOST_API = "http://localhost:3335"
$HOST_WEB = "http://localhost:5176"

# --- Cores e formatacao ---
function Write-Banner($text) {
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor DarkCyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor DarkCyan
    Write-Host ""
}

function Write-Step($number, $text) {
    Write-Host ""
    Write-Host "  [$number] $text" -ForegroundColor White -BackgroundColor DarkBlue
    Write-Host ("  " + ("-" * 60)) -ForegroundColor DarkGray
}

function Write-SubStep($text) {
    Write-Host "      > $text" -ForegroundColor Gray
}

function Write-Ok($text) {
    Write-Host "      [OK] $text" -ForegroundColor Green
}

function Write-Fail($text) {
    Write-Host "      [FALHA] $text" -ForegroundColor Red
}

function Write-Warn($text) {
    Write-Host "      [AVISO] $text" -ForegroundColor Yellow
}

function Write-Info($text) {
    Write-Host "      [INFO] $text" -ForegroundColor DarkCyan
}

function Pause-Step($message) {
    Write-Host ""
    Write-Host "  >> $message" -ForegroundColor Yellow
    Write-Host "     Pressione ENTER para continuar ou Ctrl+C para abortar..." -ForegroundColor DarkYellow
    Read-Host
}

function Test-Command($cmd) {
    try {
        $null = Get-Command $cmd -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

# ============================================================================
#  INICIO
# ============================================================================

Clear-Host
Write-Banner "ECP Pay v1.0  -  Instalacao Completa"
Write-Host "  Sistema:   Windows 11 + PowerShell" -ForegroundColor Gray
Write-Host "  Stack:     Node.js + Fastify + SQLite3 + React + Vite" -ForegroundColor Gray
Write-Host "  Produto:   Servico centralizado de pagamentos do ecossistema ECP" -ForegroundColor Gray
Write-Host "  Data:      $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host ""

# --- Detectar diretorio do projeto ---
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

# O codigo esta em 03-product-delivery/
$DELIVERY_DIR = "$projectRoot\03-product-delivery"

if (Test-Path "$DELIVERY_DIR\package.json") {
    $PROJECT_DIR = $DELIVERY_DIR
} elseif (Test-Path ".\package.json") {
    $PROJECT_DIR = (Get-Location).Path
} else {
    $PROJECT_DIR = "C:\Users\$env:USERNAME\projetos_git\ecp-digital-pay\03-product-delivery"
}

Write-Host "  Projeto:   $PROJECT_DIR" -ForegroundColor Gray

if (-not (Test-Path "$PROJECT_DIR\package.json")) {
    Write-Fail "Diretorio do projeto nao encontrado em: $PROJECT_DIR"
    Write-Host "     Verifique o caminho e tente novamente." -ForegroundColor Red
    exit 1
}

Set-Location $PROJECT_DIR
Write-Ok "Diretorio do projeto localizado"
Write-Host ""

# ============================================================================
#  FASE 1  -  VERIFICACAO DE PRE-REQUISITOS
# ============================================================================

Write-Banner "FASE 1 / 6  -  Verificacao de Pre-requisitos"

$prereqOk = $true

# --- 1.1 Node.js ---
Write-Step "1.1" "Node.js (requerido: >= 20)"

if (Test-Command "node") {
    $nodeVersion = (node --version 2>$null)
    Write-SubStep "Versao encontrada: $nodeVersion"

    $major = [int]($nodeVersion -replace 'v','').Split('.')[0]
    if ($major -ge 20) {
        Write-Ok "Node.js $nodeVersion  -  compativel"
    } else {
        Write-Fail "Node.js $nodeVersion  -  versao muito antiga (minimo: 20)"
        $prereqOk = $false
    }
} else {
    Write-Fail "Node.js nao encontrado no PATH"
    Write-Info "Instale com: winget install OpenJS.NodeJS.LTS"
    $prereqOk = $false
}

# --- 1.2 npm ---
Write-Step "1.2" "npm (requerido: >= 10)"

if (Test-Command "npm") {
    $npmVersion = (npm --version 2>$null)
    Write-Ok "npm $npmVersion"
} else {
    Write-Fail "npm nao encontrado (deveria vir com o Node.js)"
    $prereqOk = $false
}

# --- 1.3 Python ---
Write-Step "1.3" "Python 3 (requerido para compilar better-sqlite3)"

$pythonCmd = $null
if (Test-Command "python") {
    $pyVer = (python --version 2>$null)
    if ($pyVer -match "Python 3") {
        $pythonCmd = "python"
        Write-Ok "$pyVer"
    }
}
if (-not $pythonCmd -and (Test-Command "python3")) {
    $pyVer = (python3 --version 2>$null)
    if ($pyVer -match "Python 3") {
        $pythonCmd = "python3"
        Write-Ok "$pyVer"
    }
}
if (-not $pythonCmd) {
    Write-Fail "Python 3 nao encontrado no PATH"
    Write-Info "Instale com: winget install Python.Python.3.12"
    Write-Info "Marque 'Add Python to PATH' durante a instalacao"
    $prereqOk = $false
}

# --- 1.4 Git ---
Write-Step "1.4" "Git"

if (Test-Command "git") {
    $gitVersion = (git --version 2>$null)
    Write-Ok "$gitVersion"
} else {
    Write-Fail "Git nao encontrado"
    Write-Info "Instale com: winget install Git.Git"
    $prereqOk = $false
}

# --- 1.5 Visual Studio Build Tools ---
Write-Step "1.5" "Visual Studio Build Tools (compilador C++)"

$vsInstalls = @(
    @{ Year = "2026"; InternalVer = "18"; Editions = @("BuildTools","Professional","Community","Enterprise") },
    @{ Year = "2022"; InternalVer = "2022"; Editions = @("BuildTools","Professional","Community","Enterprise") }
)
$detectedVsYear = $null
$detectedVsPath = $null

foreach ($vs in $vsInstalls) {
    foreach ($edition in $vs.Editions) {
        $p86 = "C:\Program Files (x86)\Microsoft Visual Studio\$($vs.InternalVer)\$edition"
        $p64 = "C:\Program Files\Microsoft Visual Studio\$($vs.InternalVer)\$edition"
        if (Test-Path $p86) { $detectedVsYear = $vs.Year; $detectedVsPath = $p86; break }
        if (Test-Path $p64) { $detectedVsYear = $vs.Year; $detectedVsPath = $p64; break }
    }
    if ($detectedVsYear) { break }
}

if ($detectedVsYear) {
    Write-Ok "Visual Studio $detectedVsYear encontrado em: $detectedVsPath"
    $msbuildPath = Get-ChildItem -Path $detectedVsPath -Recurse -Filter "MSBuild.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($msbuildPath) {
        Write-Ok "MSBuild encontrado: $($msbuildPath.DirectoryName)"
    } else {
        Write-Warn "MSBuild nao localizado - workload C++ pode nao estar instalado"
        Write-Info "Abra o Visual Studio Installer e instale 'Desktop development with C++'"
    }
} else {
    Write-Warn "Visual Studio Build Tools nao encontrado no caminho padrao"
    Write-Info "Instale com: winget install Microsoft.VisualStudio.2022.BuildTools"
    Write-Info "Depois instale o workload 'Desktop development with C++'"
}

# --- 1.6 npm config ---
Write-Step "1.6" "Configuracao do npm (msvs_version)"

$targetMsvs = if ($detectedVsYear) { $detectedVsYear } else { "2022" }
$currentMsvs = (npm config get msvs_version 2>$null)
if ($currentMsvs -eq $targetMsvs) {
    Write-Ok "npm msvs_version ja configurado: $targetMsvs"
} else {
    Write-SubStep "Configurando npm msvs_version = $targetMsvs..."
    npm config set msvs_version $targetMsvs 2>$null
    Write-Ok "npm msvs_version configurado para $targetMsvs"
}

if ($pythonCmd) {
    Write-SubStep "Configurando npm python = $pythonCmd..."
    npm config set python $pythonCmd 2>$null
    Write-Ok "npm python configurado para $pythonCmd"
}

# --- 1.7 Estrutura do projeto ---
Write-Step "1.7" "Estrutura do projeto"

$requiredFiles = @(
    "package.json",
    "server\package.json",
    "web\package.json",
    "server\src\server.ts",
    "server\src\app.ts",
    "server\src\database\connection.ts",
    "server\src\database\migrations\001-initial.sql",
    "server\src\database\seed.ts",
    "server\src\providers\payment-provider.interface.ts",
    "server\src\providers\provider.factory.ts",
    "server\src\providers\internal\internal.adapter.ts",
    "web\src\App.tsx",
    "web\vite.config.ts",
    "server\tsconfig.json"
)

$missingFiles = @()
foreach ($f in $requiredFiles) {
    if (Test-Path "$PROJECT_DIR\$f") {
        Write-SubStep "$f"
    } else {
        Write-Fail "Arquivo nao encontrado: $f"
        $missingFiles += $f
    }
}

if ($missingFiles.Count -eq 0) {
    Write-Ok "Todos os $($requiredFiles.Count) arquivos criticos presentes"
} else {
    Write-Fail "$($missingFiles.Count) arquivo(s) faltando  -  o projeto pode estar incompleto"
    $prereqOk = $false
}

# --- Resumo pre-requisitos ---
Write-Host ""
Write-Host ("  " + ("=" * 60)) -ForegroundColor DarkCyan
if ($prereqOk) {
    Write-Host "  RESULTADO: Todos os pre-requisitos atendidos" -ForegroundColor Green
} else {
    Write-Host "  RESULTADO: Ha pre-requisitos pendentes (veja acima)" -ForegroundColor Red
    Write-Host "  Corrija os itens marcados [FALHA] e execute o script novamente." -ForegroundColor Yellow
}
Write-Host ("  " + ("=" * 60)) -ForegroundColor DarkCyan

Pause-Step "Revise os pre-requisitos acima"

if (-not $prereqOk) {
    Write-Host ""
    Write-Warn "Pre-requisitos nao atendidos. Deseja continuar mesmo assim? (S/N)"
    $resp = Read-Host "  Resposta"
    if ($resp -notmatch "^[sS]") {
        Write-Host "  Instalacao cancelada pelo usuario." -ForegroundColor Yellow
        exit 1
    }
}

# ============================================================================
#  FASE 2  -  INSTALACAO DE DEPENDENCIAS
# ============================================================================

Write-Banner "FASE 2 / 6  -  Instalacao de Dependencias"

# Este projeto usa npm workspaces: um unico npm install na raiz
# resolve todas as dependencias (server + web) com hoisting no node_modules da raiz.

Write-Step "2.1" "Verificar compatibilidade do better-sqlite3"

# Node 22+ requer better-sqlite3 >= 11.x (suporte C++20).
if ($major -ge 22) {
    Write-SubStep "Node.js $major detectado - verificando versao do better-sqlite3..."
    $serverPkgPath = "$PROJECT_DIR\server\package.json"
    $serverPkgJson = Get-Content $serverPkgPath -Raw | ConvertFrom-Json
    $bsqliteVer = $serverPkgJson.dependencies.'better-sqlite3'
    if ($bsqliteVer) {
        $bsqliteVerNum = $bsqliteVer -replace '[^0-9\.]',''
        $bsqliteMajor = [int]($bsqliteVerNum.Split('.')[0])
        if ($bsqliteMajor -lt 11) {
            Write-Warn "better-sqlite3 $bsqliteVer incompativel com Node $major - atualizando para ^11.0.0..."
            $serverPkgRaw = Get-Content $serverPkgPath -Raw
            $serverPkgRaw = $serverPkgRaw -replace '"better-sqlite3"\s*:\s*"[^"]+"', '"better-sqlite3": "^11.0.0"'
            $utf8NoBom = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($serverPkgPath, $serverPkgRaw, $utf8NoBom)
            Write-Ok "server/package.json atualizado: better-sqlite3 -> ^11.0.0"

            # Remover build antigo e lockfile para forcar recompilacao limpa
            if (Test-Path "$PROJECT_DIR\node_modules\better-sqlite3") {
                Remove-Item "$PROJECT_DIR\node_modules\better-sqlite3" -Recurse -Force -ErrorAction SilentlyContinue
                Write-SubStep "Build antigo do better-sqlite3 removido"
            }
            if (Test-Path "$PROJECT_DIR\package-lock.json") {
                Remove-Item "$PROJECT_DIR\package-lock.json" -Force -ErrorAction SilentlyContinue
                Write-SubStep "package-lock.json removido para forcar resolucao correta"
            }
        } else {
            Write-Ok "better-sqlite3 $bsqliteVer compativel com Node $major"
        }
    }
}

# --- 2.2 npm install (workspaces) ---
Write-Step "2.2" "Instalando todas as dependencias (npm workspaces)"
Write-SubStep "Executando: npm install (raiz + server + web via workspaces)"
Write-Warn "Este passo compila better-sqlite3 com node-gyp  -  pode levar 1-2 min"
Write-Host ""

Set-Location $PROJECT_DIR
npm install 2>&1 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }

Write-Host ""

# --- 2.3 Verificar dependencias (todas no node_modules da raiz via hoisting) ---
Write-Step "2.3" "Verificando dependencias instaladas"
Write-SubStep "npm workspaces faz hoisting: dependencias ficam no node_modules da raiz"

$NM = "$PROJECT_DIR\node_modules"

$allChecks = @(
    # Raiz
    @{ name = "concurrently";                      path = "$NM\concurrently" },
    # Server
    @{ name = "better-sqlite3 (binario nativo)";   path = "$NM\better-sqlite3\build\Release\better_sqlite3.node" },
    @{ name = "fastify";                            path = "$NM\fastify" },
    @{ name = "@fastify/cors";                      path = "$NM\@fastify\cors" },
    @{ name = "@fastify/helmet";                    path = "$NM\@fastify\helmet" },
    @{ name = "bcryptjs";                           path = "$NM\bcryptjs" },
    @{ name = "jsonwebtoken";                       path = "$NM\jsonwebtoken" },
    @{ name = "zod";                                path = "$NM\zod" },
    @{ name = "node-cron";                          path = "$NM\node-cron" },
    @{ name = "tsx";                                path = "$NM\tsx" },
    @{ name = "typescript";                         path = "$NM\typescript" },
    # Web
    @{ name = "react";                              path = "$NM\react" },
    @{ name = "react-dom";                          path = "$NM\react-dom" },
    @{ name = "react-router-dom";                   path = "$NM\react-router-dom" },
    @{ name = "vite";                               path = "$NM\vite" },
    @{ name = "tailwindcss";                        path = "$NM\tailwindcss" },
    @{ name = "lucide-react";                       path = "$NM\lucide-react" },
    @{ name = "recharts";                           path = "$NM\recharts" }
)

$depsOk = $true
foreach ($check in $allChecks) {
    if (Test-Path $check.path) {
        Write-Ok $check.name
    } else {
        Write-Fail "$($check.name)  -  nao encontrado"
        $depsOk = $false
    }
}

if (-not $depsOk) {
    Write-Fail "Algumas dependencias nao foram instaladas corretamente"
    Write-Info "Problema mais comum: node-gyp sem Build Tools C++ (para better-sqlite3)"
    Write-Info "Tente: npm install --workspace=server && npm install --workspace=web"
}

# --- Resumo ---
Write-Host ""
Write-Host ("  " + ("=" * 60)) -ForegroundColor DarkCyan
Write-Host "  node_modules (hoisted): $(if (Test-Path $NM) { 'OK' } else { 'FALHA' })" -ForegroundColor $(if (Test-Path $NM) { 'Green' } else { 'Red' })
Write-Host "  Dependencias:           $(if ($depsOk) { 'TODAS OK' } else { 'FALHAS (veja acima)' })" -ForegroundColor $(if ($depsOk) { 'Green' } else { 'Red' })
Write-Host ("  " + ("=" * 60)) -ForegroundColor DarkCyan

Pause-Step "Revise a instalacao de dependencias"

# ============================================================================
#  FASE 3  -  CONFIGURACAO DE AMBIENTE
# ============================================================================

Write-Banner "FASE 3 / 6  -  Configuracao de Ambiente"

Write-Step "3.1" "Arquivo .env"

$envFile = "$PROJECT_DIR\.env"

if (Test-Path $envFile) {
    Write-Warn "Arquivo .env ja existe  -  mantendo o existente"
    Write-SubStep "Conteudo atual:"
    Get-Content $envFile | ForEach-Object { Write-Host "      | $_" -ForegroundColor DarkGray }
} else {
    Write-SubStep "Criando .env com valores de desenvolvimento..."

    $envContent = @"
# ECP Pay  -  Variaveis de Ambiente (Desenvolvimento)
# Gerado automaticamente pelo script de instalacao em $(Get-Date -Format 'yyyy-MM-dd HH:mm')

# Servidor
PORT=3335
HOST=0.0.0.0
NODE_ENV=development

# JWT (NUNCA use este valor em producao!)
JWT_SECRET=ecp-pay-admin-secret-mude-em-producao

# Banco de Dados
DATABASE_PATH=./database-pay.sqlite

# CORS (painel admin)
CORS_ORIGIN=http://localhost:5176

# Feature Flag  -  Provider
PAYMENT_PROVIDER=internal

# Asaas (so necessario quando PAYMENT_PROVIDER=external)
ASAAS_API_KEY=
ASAAS_SANDBOX=true
ASAAS_WEBHOOK_TOKEN=

# Modo INTERNAL  -  Simulacao
INTERNAL_SIMULATION_DELAY=3000
INTERNAL_AUTO_APPROVE_CARDS=true
INTERNAL_MAX_SIMULATED_AMOUNT=10000000

# Frontend
VITE_API_URL=http://localhost:3335
"@

    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($envFile, $envContent, $utf8NoBom)
    Write-Ok "Arquivo .env criado"
    Write-SubStep "Conteudo:"
    Get-Content $envFile | ForEach-Object { Write-Host "      | $_" -ForegroundColor DarkGray }
}

Write-Host ""
Write-Step "3.2" "Resumo da configuracao"
Write-Info "API:       $HOST_API"
Write-Info "Admin:     $HOST_WEB"
Write-Info "Banco:     database-pay.sqlite (arquivo local, criado no startup)"
Write-Info "JWT:       Secret de desenvolvimento (trocar em producao!)"
Write-Info "Provider:  INTERNAL (simulacao local, sem gateway externo)"
Write-Info "Proxy:     Vite redireciona /admin/* e /pay/* para a API"

# ============================================================================
#  FASE 4  -  BANCO DE DADOS
# ============================================================================

Write-Banner "FASE 4 / 6  -  Banco de Dados (SQLite3)"

# --- 4.1 Limpar banco existente ---
Write-Step "4.1" "Verificar banco existente"

$dbFile = "$PROJECT_DIR\server\database-pay.sqlite"
if (Test-Path $dbFile) {
    $dbSize = [math]::Round((Get-Item $dbFile).Length / 1KB, 1)
    Write-Warn "Banco ja existe ($dbSize KB)"
    Write-Host ""
    Write-Host "      Deseja recriar o banco do zero? (S/N)" -ForegroundColor Yellow
    $resp = Read-Host "      Resposta"
    if ($resp -match "^[sS]") {
        Write-SubStep "Removendo banco existente..."
        Remove-Item "$PROJECT_DIR\server\database-pay.sqlite" -ErrorAction SilentlyContinue
        Remove-Item "$PROJECT_DIR\server\database-pay.sqlite-wal" -ErrorAction SilentlyContinue
        Remove-Item "$PROJECT_DIR\server\database-pay.sqlite-shm" -ErrorAction SilentlyContinue
        Write-Ok "Banco removido"
    } else {
        Write-Info "Mantendo banco existente"
    }
} else {
    Write-Info "Nenhum banco existente  -  sera criado automaticamente no startup"
}

Write-Step "4.2" "Banco de dados"
Write-Info "O ECP Pay cria o banco, executa migrations e seed automaticamente ao iniciar."
Write-Info "Migrations: server/src/database/migrations/001-initial.sql (10 tabelas + 16 indices)"
Write-Info "Seed: admin user, 3 apps registrados, 20 transacoes demo, 3 tokens, 5 splits"

Pause-Step "Banco de dados sera criado no startup  -  avancar?"

# ============================================================================
#  FASE 5  -  SUBIR A APLICACAO
# ============================================================================

Write-Banner "FASE 5 / 6  -  Subir a Aplicacao"

# --- Verificar portas ---
Write-Step "5.1" "Verificar portas disponiveis"

$port3335 = netstat -ano 2>$null | Select-String ":3335\s" | Select-String "LISTENING"
$port5176 = netstat -ano 2>$null | Select-String ":5176\s" | Select-String "LISTENING"

if ($port3335) {
    Write-Warn "Porta 3335 ja esta em uso!"
    Write-SubStep ($port3335 | Out-String).Trim()
    Write-Info "Mate o processo ou altere PORT no .env"
} else {
    Write-Ok "Porta 3335 disponivel (API)"
}

if ($port5176) {
    Write-Warn "Porta 5176 ja esta em uso!"
    Write-SubStep ($port5176 | Out-String).Trim()
} else {
    Write-Ok "Porta 5176 disponivel (Admin Panel)"
}

# --- Iniciar servidor ---
Write-Step "5.2" "Iniciando API Fastify (porta 3335)"
Write-SubStep "Executando: npm run dev:server (em background)"

Set-Location $PROJECT_DIR
$serverJob = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c","npm","run","dev:server" `
    -WorkingDirectory $PROJECT_DIR `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput "$PROJECT_DIR\server-stdout.log" `
    -RedirectStandardError "$PROJECT_DIR\server-stderr.log"

Write-SubStep "Processo iniciado (PID: $($serverJob.Id))"
Write-SubStep "Aguardando API ficar pronta (migrations + seed no primeiro startup)..."

$apiReady = $false
for ($i = 1; $i -le 45; $i++) {
    Start-Sleep -Seconds 1
    Write-Host "`r      Tentativa $i/45..." -NoNewline -ForegroundColor DarkGray
    try {
        $health = Invoke-RestMethod "$HOST_API/pay/health" -TimeoutSec 2 -ErrorAction Stop
        if ($health.status -eq "ok" -or $health.provider) {
            $apiReady = $true
            break
        }
    } catch {
        # API ainda nao esta pronta
    }
}
Write-Host ""

if ($apiReady) {
    Write-Ok "API Fastify rodando em $HOST_API"
    Write-Ok "Health check: provider = $($health.provider)"
} else {
    Write-Fail "API nao respondeu em 45 segundos"

    if (Test-Path "$PROJECT_DIR\server-stderr.log") {
        $errLog = Get-Content "$PROJECT_DIR\server-stderr.log" -Raw -ErrorAction SilentlyContinue
        if ($errLog) {
            Write-Host ""
            Write-SubStep "Ultimas linhas do log de erro:"
            ($errLog -split "`n" | Select-Object -Last 10) | ForEach-Object { Write-Host "      | $_" -ForegroundColor Red }
        }
    }
    Write-Info "Verifique os logs:"
    Write-Info "  Get-Content server-stdout.log"
    Write-Info "  Get-Content server-stderr.log"
}

# --- Iniciar frontend ---
Write-Step "5.3" "Iniciando Admin Panel Vite (porta 5176)"
Write-SubStep "Executando: npm run dev:web (em background)"

$webJob = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c","npm","run","dev:web" `
    -WorkingDirectory $PROJECT_DIR `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput "$PROJECT_DIR\web-stdout.log" `
    -RedirectStandardError "$PROJECT_DIR\web-stderr.log"

Write-SubStep "Processo iniciado (PID: $($webJob.Id))"
Write-SubStep "Aguardando admin panel ficar pronto..."

$webReady = $false
for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 1
    Write-Host "`r      Tentativa $i/30..." -NoNewline -ForegroundColor DarkGray
    try {
        $null = Invoke-WebRequest "$HOST_WEB" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        $webReady = $true
        break
    } catch {
        # Frontend ainda nao esta pronto
    }
}
Write-Host ""

if ($webReady) {
    Write-Ok "Admin Panel rodando em $HOST_WEB"
} else {
    Write-Warn "Admin Panel nao respondeu em 30 segundos  -  pode estar compilando"
    Write-Info "Verifique: Get-Content web-stdout.log"
}

# --- Resumo ---
Write-Host ""
Write-Host ("  " + ("=" * 60)) -ForegroundColor DarkCyan
Write-Host "  API:      $HOST_API $(if ($apiReady) { '[ ONLINE ]' } else { '[ OFFLINE ]' })" -ForegroundColor $(if ($apiReady) { 'Green' } else { 'Red' })
Write-Host "  Admin:    $HOST_WEB $(if ($webReady) { '[ ONLINE ]' } else { '[ AGUARDANDO ]' })" -ForegroundColor $(if ($webReady) { 'Green' } else { 'Yellow' })
Write-Host "  Provider: INTERNAL (simulacao)" -ForegroundColor Cyan
Write-Host "  API PID:  $($serverJob.Id)" -ForegroundColor Gray
Write-Host "  Web PID:  $($webJob.Id)" -ForegroundColor Gray
Write-Host ("  " + ("=" * 60)) -ForegroundColor DarkCyan

Pause-Step "Aplicacao iniciada  -  revise o status acima"

# ============================================================================
#  FASE 6  -  SMOKE TEST
# ============================================================================

Write-Banner "FASE 6 / 6  -  Smoke Test (Validacao Completa)"

$passed = 0
$failed = 0
$total = 10

function Test-Endpoint($name, $scriptBlock) {
    try {
        $result = & $scriptBlock
        if ($result) {
            Write-Ok $name
            return $true
        } else {
            Write-Fail $name
            return $false
        }
    } catch {
        Write-Fail "$name  -  $($_.Exception.Message)"
        return $false
    }
}

# --- 6.1 Health ---
Write-Step "6.1" "Health Check"
if (Test-Endpoint "GET /pay/health" {
    $r = Invoke-RestMethod "$HOST_API/pay/health" -TimeoutSec 5 -ErrorAction Stop
    Write-SubStep "provider: $($r.provider) | mode: $($r.mode)"
    return $true
}) { $passed++ } else { $failed++ }

# --- 6.2 Admin Login ---
Write-Step "6.2" "Autenticacao Admin (Login)"
$token = $null
if (Test-Endpoint "POST /admin/auth/login" {
    $body = '{"email":"admin@ecpay.dev","password":"Admin@123"}'
    $r = Invoke-RestMethod "$HOST_API/admin/auth/login" -Method POST `
        -ContentType "application/json" -Body $body -TimeoutSec 5 -ErrorAction Stop
    $script:token = $r.token
    Write-SubStep "Token: $($r.token.Substring(0, [Math]::Min(40, $r.token.Length)))..."
    return $null -ne $r.token
}) { $passed++ } else { $failed++ }

if (-not $token) {
    Write-Fail "Sem token JWT  -  nao e possivel testar endpoints protegidos"
    Write-Info "Verifique se o seed foi executado corretamente"
    $failed += 8
} else {
    $headers = @{ Authorization = "Bearer $token" }

    # --- 6.3 Auth /me ---
    Write-Step "6.3" "Dados do admin autenticado"
    if (Test-Endpoint "GET /admin/auth/me" {
        $r = Invoke-RestMethod "$HOST_API/admin/auth/me" -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Write-SubStep "Nome: $($r.name) | Email: $($r.email) | Role: $($r.role)"
        return $r.email -eq "admin@ecpay.dev"
    }) { $passed++ } else { $failed++ }

    # --- 6.4 Dashboard ---
    Write-Step "6.4" "Dashboard (KPIs agregados)"
    if (Test-Endpoint "GET /admin/dashboard" {
        $r = Invoke-RestMethod "$HOST_API/admin/dashboard" -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Write-SubStep "Dashboard retornou dados com sucesso"
        return $true
    }) { $passed++ } else { $failed++ }

    # --- 6.5 Transactions ---
    Write-Step "6.5" "Transacoes"
    if (Test-Endpoint "GET /admin/transactions" {
        $r = Invoke-RestMethod "$HOST_API/admin/transactions" -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        $count = if ($r.data) { $r.data.Count } elseif ($r -is [array]) { $r.Count } else { 0 }
        Write-SubStep "Transacoes encontradas: $count"
        return $true
    }) { $passed++ } else { $failed++ }

    # --- 6.6 Providers ---
    Write-Step "6.6" "Provider ativo"
    if (Test-Endpoint "GET /admin/providers" {
        $r = Invoke-RestMethod "$HOST_API/admin/providers" -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Write-SubStep "Provider: $($r.provider) | Mode: $($r.mode)"
        return $true
    }) { $passed++ } else { $failed++ }

    # --- 6.7 Apps registrados ---
    Write-Step "6.7" "Apps do ecossistema"
    if (Test-Endpoint "GET /admin/apps" {
        $r = Invoke-RestMethod "$HOST_API/admin/apps" -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        $count = if ($r -is [array]) { $r.Count } elseif ($r.data) { $r.data.Count } else { 0 }
        Write-SubStep "Apps registrados: $count"
        return $count -ge 3
    }) { $passed++ } else { $failed++ }

    # --- 6.8 Feature Flags ---
    Write-Step "6.8" "Feature Flags"
    if (Test-Endpoint "GET /admin/feature-flags" {
        $r = Invoke-RestMethod "$HOST_API/admin/feature-flags" -Headers $headers -TimeoutSec 5 -ErrorAction Stop
        Write-SubStep "Feature flags retornadas com sucesso"
        return $true
    }) { $passed++ } else { $failed++ }

    # --- 6.9 Payment API (Pix via service key) ---
    Write-Step "6.9" "API de Pagamento (Pix via ecp-bank key)"
    if (Test-Endpoint "POST /pay/pix" {
        $pixHeaders = @{
            "X-API-Key" = "ecp-bank-dev-key"
            "X-Source-App" = "ecp-bank"
            "X-Idempotency-Key" = [guid]::NewGuid().ToString()
            "Content-Type" = "application/json"
        }
        $pixBody = '{"amount":5000,"customer_name":"Teste Smoke","customer_document":"12345678900","description":"Smoke test Pix"}'
        $r = Invoke-RestMethod "$HOST_API/pay/pix" -Method POST `
            -Headers $pixHeaders -Body $pixBody -TimeoutSec 10 -ErrorAction Stop
        Write-SubStep "Transacao: $($r.transaction_id) | Status: $($r.status)"
        return $null -ne $r.transaction_id
    }) { $passed++ } else { $failed++ }

    # --- 6.10 Frontend ---
    Write-Step "6.10" "Admin Panel (React SPA)"
    if (Test-Endpoint "GET $HOST_WEB" {
        $r = Invoke-WebRequest "$HOST_WEB" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Write-SubStep "Status: $($r.StatusCode) | Tamanho: $($r.Content.Length) bytes"
        return $r.StatusCode -eq 200
    }) { $passed++ } else { $failed++ }
}

# ============================================================================
#  RESULTADO FINAL
# ============================================================================

Write-Host ""
Write-Host ""
Write-Banner "RESULTADO FINAL"

Write-Host "  Smoke Test: $passed/$total testes passaram" -ForegroundColor $(if ($failed -eq 0) { 'Green' } elseif ($failed -le 2) { 'Yellow' } else { 'Red' })
Write-Host ""

if ($failed -eq 0) {
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host "  INSTALACAO CONCLUIDA COM SUCESSO!" -ForegroundColor Green
    Write-Host "  ============================================" -ForegroundColor Green
} else {
    Write-Host "  ============================================" -ForegroundColor Yellow
    Write-Host "  INSTALACAO CONCLUIDA COM $failed FALHA(S)" -ForegroundColor Yellow
    Write-Host "  ============================================" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Acesse a aplicacao:" -ForegroundColor Cyan
Write-Host ""
Write-Host "    Admin Panel:  $HOST_WEB" -ForegroundColor White
Write-Host "    API:          $HOST_API" -ForegroundColor White
Write-Host "    Health:       $HOST_API/pay/health" -ForegroundColor White
Write-Host ""
Write-Host "  Login do painel admin:" -ForegroundColor Cyan
Write-Host ""
Write-Host "    Email:     admin@ecpay.dev" -ForegroundColor White
Write-Host "    Senha:     Admin@123" -ForegroundColor White
Write-Host ""
Write-Host "  API Keys dos apps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "    ecp-bank:  ecp-bank-dev-key" -ForegroundColor White
Write-Host "    ecp-emps:  ecp-emps-dev-key" -ForegroundColor White
Write-Host "    ecp-food:  ecp-food-dev-key" -ForegroundColor White
Write-Host ""
Write-Host "  Provider ativo: INTERNAL (simulacao local)" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Processos em execucao:" -ForegroundColor Cyan
Write-Host ""
Write-Host "    API PID:   $($serverJob.Id)" -ForegroundColor Gray
Write-Host "    Web PID:   $($webJob.Id)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Para parar:" -ForegroundColor Cyan
Write-Host ""
Write-Host "    Stop-Process -Id $($serverJob.Id),$($webJob.Id) -Force" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Logs:" -ForegroundColor Cyan
Write-Host ""
Write-Host "    Get-Content server-stdout.log -Tail 20" -ForegroundColor Gray
Write-Host "    Get-Content web-stdout.log -Tail 20" -ForegroundColor Gray
Write-Host ""

# Abrir no browser
Write-Host "  Deseja abrir o admin panel no navegador? (S/N)" -ForegroundColor Yellow
$resp = Read-Host "  Resposta"
if ($resp -match "^[sS]") {
    Start-Process "$HOST_WEB"
    Write-Host ""
    Write-Ok "Navegador aberto em $HOST_WEB"
}

# Limpar logs temporarios ao sair
Write-Host ""
Write-Host ("=" * 70) -ForegroundColor DarkCyan
Write-Host "  Script finalizado. Bom desenvolvimento!" -ForegroundColor Cyan
Write-Host ("=" * 70) -ForegroundColor DarkCyan
Write-Host ""
