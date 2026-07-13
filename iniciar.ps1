# PGFN Devedores — inicializador com atualização automática (Windows)
# Executado pelo Iniciar-PGFN-Windows.bat. A cada abertura:
#   1. verifica no GitHub se há versão nova; se houver, baixa e aplica
#   2. instala dependências / constrói a interface quando necessário
#   3. inicia o servidor (que abre o navegador quando estiver pronto)
#
# Repositório privado? Gere um token em https://github.com/settings/tokens
# (permissão somente leitura de conteúdo) e cole-o no arquivo:
#   %LOCALAPPDATA%\PGFN-Devedores\token.txt

$Repo = "esleyricardo/boost-lead-forge"
$Branch = "main"

$AppDir = $PSScriptRoot
Set-Location $AppDir

$DataRoot = Join-Path $env:LOCALAPPDATA "PGFN-Devedores"
$DataDir = Join-Path $DataRoot "data"
$VersaoFile = Join-Path $DataRoot "versao.txt"
$TokenFile = Join-Path $DataRoot "token.txt"
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

Write-Host "============================================================"
Write-Host "  PGFN Devedores - versao desktop"
Write-Host "============================================================"
Write-Host "Dados salvos em: $DataDir"
Write-Host ""

# ---- 1) Node.js instalado? ----
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERRO] Node.js nao encontrado." -ForegroundColor Red
    Write-Host "Instale a versao LTS em: https://nodejs.org e rode novamente."
    exit 1
}

# ---- 2) Atalho na area de trabalho ----
try {
    $atalho = Join-Path ([Environment]::GetFolderPath("Desktop")) "PGFN Devedores.lnk"
    if (-not (Test-Path $atalho)) {
        $s = (New-Object -ComObject WScript.Shell).CreateShortcut($atalho)
        $s.TargetPath = Join-Path $AppDir "Iniciar-PGFN-Windows.bat"
        $s.WorkingDirectory = $AppDir
        $s.Description = "Abrir o PGFN Devedores"
        $s.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
        $s.Save()
        Write-Host "Atalho 'PGFN Devedores' criado na area de trabalho."
    }
} catch { }

# ---- 3) Atualizacao automatica ----
$headers = @{ "User-Agent" = "PGFN-Devedores"; "Accept" = "application/vnd.github+json" }
if (Test-Path $TokenFile) {
    $token = ([string](Get-Content $TokenFile -Raw)).Trim()
    if ($token) { $headers["Authorization"] = "Bearer $token" }
}

$precisaInstalar = -not (Test-Path (Join-Path $AppDir "node_modules"))
$precisaBuild = -not (Test-Path (Join-Path $AppDir "dist"))

try {
    Write-Host "Verificando atualizacoes..."
    $info = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/commits/$Branch" -Headers $headers -TimeoutSec 20
    $shaRemoto = $info.sha
    $shaLocal = if (Test-Path $VersaoFile) { ([string](Get-Content $VersaoFile -Raw)).Trim() } else { "" }

    if ($shaRemoto -and ($shaRemoto -ne $shaLocal)) {
        Write-Host "Nova versao encontrada. Baixando e aplicando..." -ForegroundColor Yellow

        $tmp = Join-Path $env:TEMP ("pgfn-update-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $tmp | Out-Null
        $zip = Join-Path $tmp "update.zip"

        Invoke-WebRequest -Uri "https://api.github.com/repos/$Repo/zipball/$Branch" -Headers $headers -OutFile $zip -TimeoutSec 300
        Expand-Archive -Path $zip -DestinationPath $tmp -Force

        # O zip tem uma unica pasta raiz com nome variavel
        $raiz = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
        if (-not $raiz) { throw "Pacote de atualizacao vazio." }

        # Copia tudo por cima do app, exceto o .bat em execucao
        Get-ChildItem -Path $raiz.FullName -Force |
            Where-Object { $_.Name -ne "Iniciar-PGFN-Windows.bat" } |
            ForEach-Object { Copy-Item -Path $_.FullName -Destination $AppDir -Recurse -Force }

        # Forca reinstalacao/reconstrucao com o codigo novo
        if (Test-Path (Join-Path $AppDir "dist")) {
            Remove-Item -Recurse -Force (Join-Path $AppDir "dist")
        }
        $precisaInstalar = $true
        $precisaBuild = $true

        Set-Content -Path $VersaoFile -Value $shaRemoto
        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
        Write-Host "Atualizacao aplicada com sucesso." -ForegroundColor Green
    } else {
        Write-Host "Sistema ja esta na versao mais recente."
    }
} catch {
    Write-Host "Nao foi possivel verificar atualizacoes agora (sem internet, repositorio privado sem token, ou limite da API)." -ForegroundColor Yellow
    Write-Host "O sistema vai iniciar normalmente com a versao instalada."
}

# ---- 4) Dependencias e interface ----
if ($precisaInstalar) {
    Write-Host ""
    Write-Host "Instalando dependencias (pode demorar alguns minutos)..."
    & npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERRO] Falha ao instalar dependencias. Verifique sua internet." -ForegroundColor Red
        exit 1
    }
}
if ($precisaBuild) {
    Write-Host "Preparando a interface..."
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERRO] Falha ao preparar a interface." -ForegroundColor Red
        exit 1
    }
}

# ---- 5) Inicia o servidor (abre o navegador quando estiver pronto) ----
Write-Host ""
Write-Host "============================================================"
Write-Host "  Sistema iniciando... o navegador abre sozinho quando o"
Write-Host "  servidor estiver pronto. Endereco: http://localhost:3001"
Write-Host ""
Write-Host "  NAO FECHE ESTA JANELA enquanto estiver usando o sistema."
Write-Host "============================================================"
Write-Host ""

$env:DATA_DIR = $DataDir
$env:OPEN_BROWSER = "1"
& npm start
