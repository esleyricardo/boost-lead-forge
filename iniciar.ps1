# PGFN Devedores — inicializador com atualização automática (Windows)
# Roda 100% oculto (chamado pelo iniciar-oculto.vbs). A cada abertura:
#   1. verifica no GitHub se há versão nova; se houver, baixa e aplica
#   2. instala dependências / constrói a interface quando necessário
#   3. inicia o servidor em segundo plano (sem janela de console) e abre
#      o app em janela própria — fechar a janela encerra o servidor
#
# Tudo que aconteceu fica registrado em:
#   %LOCALAPPDATA%\PGFN-Devedores\log.txt
# Se algo não funcionar, envie o conteúdo desse arquivo.
#
# Repositório privado? Gere um token em https://github.com/settings/tokens
# (permissão somente leitura de conteúdo) e cole-o no arquivo:
#   %LOCALAPPDATA%\PGFN-Devedores\token.txt

$Repo = "esleyricardo/boost-lead-forge"
$Branch = "main"
$Porta = 3001

# Corrige uma causa comum de "atualização silenciosamente não funciona":
# o Windows PowerShell 5.1 às vezes usa TLS 1.0 por padrão, que a API do
# GitHub recusa — a chamada falha e o erro ficava mascarado.
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

$AppDir = $PSScriptRoot
Set-Location $AppDir

$DataRoot = Join-Path $env:LOCALAPPDATA "PGFN-Devedores"
$DataDir = Join-Path $DataRoot "data"
$VersaoFile = Join-Path $DataRoot "versao.txt"
$TokenFile = Join-Path $DataRoot "token.txt"
$LogFile = Join-Path $DataRoot "log.txt"
$ServerLogFile = Join-Path $DataRoot "servidor.log"
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

# Evita o log crescer para sempre
if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 1MB) {
    Remove-Item $LogFile -Force -ErrorAction SilentlyContinue
}

function Log([string]$msg) {
    $linha = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Add-Content -Path $LogFile -Value $linha -ErrorAction SilentlyContinue
    Write-Host $linha
}

function MostrarErro([string]$msg) {
    Log "[ERRO] $msg"
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show(
            "$msg`n`nDetalhes em: $LogFile",
            "PGFN Devedores",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    } catch { }
}

function Notificar([string]$msg) {
    Log $msg
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $icone = New-Object System.Windows.Forms.NotifyIcon
        $icone.Icon = [System.Drawing.SystemIcons]::Information
        $icone.Visible = $true
        $icone.ShowBalloonTip(4000, "PGFN Devedores", $msg, [System.Windows.Forms.ToolTipIcon]::Info)
        Start-Sleep -Seconds 1
        $icone.Dispose()
    } catch { }
}

function UltimasLinhas([string]$arquivo, [int]$n = 15) {
    if (Test-Path $arquivo) { (Get-Content $arquivo -Tail $n) -join "`n" } else { "(arquivo de log vazio)" }
}

Log "===== Iniciando ====="

# ---- 1) Node.js instalado? ----
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    MostrarErro "Node.js não encontrado. Instale a versão LTS em https://nodejs.org e abra o sistema novamente."
    exit 1
}

# ---- 2) Atalho na área de trabalho (aponta para o launcher oculto) ----
try {
    $atalho = Join-Path ([Environment]::GetFolderPath("Desktop")) "PGFN Devedores.lnk"
    $vbsPath = Join-Path $AppDir "iniciar-oculto.vbs"
    $precisaAtalho = (-not (Test-Path $atalho))
    if (-not $precisaAtalho) {
        # Corrige atalhos criados por versões antigas (apontavam para o .bat)
        $s0 = (New-Object -ComObject WScript.Shell).CreateShortcut($atalho)
        if ($s0.TargetPath -notlike "*iniciar-oculto.vbs") { $precisaAtalho = $true }
    }
    if ($precisaAtalho -and (Test-Path $vbsPath)) {
        $s = (New-Object -ComObject WScript.Shell).CreateShortcut($atalho)
        $s.TargetPath = $vbsPath
        $s.WorkingDirectory = $AppDir
        $s.Description = "Abrir o PGFN Devedores"
        $s.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
        $s.Save()
        Log "Atalho da área de trabalho criado/atualizado."
    }
} catch {
    Log "Aviso: não foi possível criar o atalho ($($_.Exception.Message))"
}

# ---- 3) Já existe uma instância rodando? Reaproveita: só reabre a janela ----
try {
    $ping = Invoke-RestMethod -Uri "http://localhost:$Porta/api/health" -TimeoutSec 2 -UseBasicParsing
    if ($ping.ok) {
        Log "Servidor já estava rodando; reabrindo a janela."
        Start-Process "http://localhost:$Porta"
        exit 0
    }
} catch { }

# ---- 4) Atualização automática ----
$headers = @{ "User-Agent" = "PGFN-Devedores"; "Accept" = "application/vnd.github+json" }
if (Test-Path $TokenFile) {
    $token = ([string](Get-Content $TokenFile -Raw)).Trim()
    if ($token) { $headers["Authorization"] = "Bearer $token" }
}

$precisaInstalar = -not (Test-Path (Join-Path $AppDir "node_modules"))
$precisaBuild = -not (Test-Path (Join-Path $AppDir "dist"))
$shaLocal = if (Test-Path $VersaoFile) { ([string](Get-Content $VersaoFile -Raw)).Trim() } else { "" }
$versaoAtual = $shaLocal

try {
    Log "Verificando atualizações em github.com/$Repo ($Branch)..."
    $info = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/commits/$Branch" -Headers $headers -TimeoutSec 20 -UseBasicParsing
    $shaRemoto = $info.sha
    Log "Versão instalada: $(if ($shaLocal) { $shaLocal.Substring(0,7) } else { '(nenhuma)' }) | Versão remota: $($shaRemoto.Substring(0,7))"

    if ($shaRemoto -and ($shaRemoto -ne $shaLocal)) {
        Notificar "Atualizando o sistema, aguarde um instante..."

        $tmp = Join-Path $env:TEMP ("pgfn-update-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $tmp | Out-Null
        $zip = Join-Path $tmp "update.zip"

        Invoke-WebRequest -Uri "https://api.github.com/repos/$Repo/zipball/$Branch" -Headers $headers -OutFile $zip -TimeoutSec 300 -UseBasicParsing
        Expand-Archive -Path $zip -DestinationPath $tmp -Force

        # O zip tem uma única pasta raiz com nome variável
        $raiz = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
        if (-not $raiz) { throw "Pacote de atualização veio vazio." }

        # Copia tudo por cima do app, exceto os arquivos do próprio launcher em execução
        Get-ChildItem -Path $raiz.FullName -Force |
            Where-Object { $_.Name -notin @("Iniciar-PGFN-Windows.bat", "iniciar-oculto.vbs", "iniciar.ps1") } |
            ForEach-Object { Copy-Item -Path $_.FullName -Destination $AppDir -Recurse -Force }
        foreach ($nome in @("Iniciar-PGFN-Windows.bat", "iniciar-oculto.vbs", "iniciar.ps1")) {
            $origem = Join-Path $raiz.FullName $nome
            if (Test-Path $origem) { Copy-Item -Path $origem -Destination (Join-Path $AppDir $nome) -Force }
        }

        # Força reinstalação/reconstrução com o código novo
        if (Test-Path (Join-Path $AppDir "dist")) {
            Remove-Item -Recurse -Force (Join-Path $AppDir "dist")
        }
        $precisaInstalar = $true
        $precisaBuild = $true
        $versaoAtual = $shaRemoto

        Set-Content -Path $VersaoFile -Value $shaRemoto
        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
        Log "Atualização aplicada com sucesso ($($shaRemoto.Substring(0,7)))."
    } else {
        Log "Sistema já está na versão mais recente."
    }
} catch {
    Log "Não foi possível verificar/aplicar atualizações: $($_.Exception.Message)"
    Log "O sistema vai iniciar normalmente com a versão já instalada."
}

# ---- 5) Dependências e interface ----
if ($precisaInstalar) {
    Log "Instalando dependências (pode demorar alguns minutos)..."
    Notificar "Preparando o sistema pela primeira vez, isso pode levar alguns minutos..."
    & npm install --no-audit --no-fund *>> $LogFile
    if ($LASTEXITCODE -ne 0) {
        MostrarErro "Falha ao instalar dependências. Verifique sua conexão com a internet."
        exit 1
    }
}
if ($precisaBuild) {
    Log "Preparando a interface..."
    & npm run build *>> $LogFile
    if ($LASTEXITCODE -ne 0) {
        MostrarErro "Falha ao preparar a interface do sistema."
        exit 1
    }
}

# ---- 6) Inicia o servidor OCULTO (sem janela) e aguarda ele responder ----
Log "Iniciando o servidor em segundo plano..."
$env:DATA_DIR = $DataDir
$env:OPEN_BROWSER = "1"
$env:APP_VERSAO = $versaoAtual
$env:PORT = "$Porta"

$argsServidor = "/c npm start >> ""$ServerLogFile"" 2>&1"
$paramsServidor = @{
    FilePath         = "cmd.exe"
    ArgumentList     = $argsServidor
    WorkingDirectory = $AppDir
    WindowStyle      = "Hidden"
    PassThru         = $true
}
$procServidor = Start-Process @paramsServidor

# Aguarda o servidor responder (o próprio servidor abre a janela do app
# quando estiver pronto). Numa base grande, a primeira abertura após uma
# atualização pode reconstruir o índice de busca — isso leva VÁRIOS minutos
# e é normal. Esperamos até 40 minutos, desde que o processo continue vivo.
$prontoEm = $null
$avisou = $false
for ($i = 0; $i -lt 1200; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-RestMethod -Uri "http://localhost:$Porta/api/health" -TimeoutSec 2 -UseBasicParsing
        if ($r.ok) { $prontoEm = $i; break }
    } catch { }

    if ($procServidor -and $procServidor.HasExited) {
        MostrarErro ("O servidor encerrou com erro logo apos iniciar.`n`nUltimas linhas de servidor.log:`n`n" + (UltimasLinhas $ServerLogFile 15))
        exit 1
    }

    if (-not $avisou -and $i -eq 60) {
        # 2 minutos se passaram: tranquiliza o usuário
        $avisou = $true
        Notificar "Preparando a base (indice de busca). Pode levar varios minutos; a janela abre sozinha quando terminar."
        Log "Servidor ainda preparando (provavel construcao de indice); seguimos aguardando..."
    }
}

if ($null -eq $prontoEm) {
    MostrarErro ("O sistema nao respondeu em 40 minutos.`n`nUltimas linhas de servidor.log:`n`n" + (UltimasLinhas $ServerLogFile 15))
    exit 1
}

Log "Servidor pronto. Sistema iniciado com sucesso."
