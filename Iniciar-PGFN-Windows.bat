@echo off
setlocal
title PGFN Devedores - Servidor local
cd /d "%~dp0"

echo ============================================================
echo   PGFN Devedores - versao desktop (roda no seu computador)
echo ============================================================
echo.

REM 1) Verifica se o Node.js esta instalado
where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado.
  echo.
  echo Instale o Node.js LTS em: https://nodejs.org
  echo Depois rode este arquivo novamente.
  echo.
  pause
  exit /b 1
)

REM 2) Guarda os dados FORA da pasta do app (atualizar o app nao apaga nada)
set "DATA_DIR=%LOCALAPPDATA%\PGFN-Devedores\data"
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
echo Dados salvos em: %DATA_DIR%
echo.

REM 3) Cria o atalho "PGFN Devedores" na area de trabalho (se nao existir)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Join-Path ([Environment]::GetFolderPath('Desktop')) 'PGFN Devedores.lnk'; if (-not (Test-Path $p)) { $s = (New-Object -ComObject WScript.Shell).CreateShortcut($p); $s.TargetPath = '%~f0'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'Abrir o PGFN Devedores'; $s.IconLocation = '%SystemRoot%\System32\shell32.dll,13'; $s.Save(); Write-Host 'Atalho criado na area de trabalho.' }" 2>nul

REM 4) Primeira execucao: instala dependencias e constroi a interface
if not exist node_modules (
  echo Instalando dependencias ^(so na primeira vez, pode demorar alguns minutos^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [ERRO] Falha ao instalar dependencias. Verifique sua internet.
    pause
    exit /b 1
  )
)
if not exist dist (
  echo Preparando a interface ^(so na primeira vez^)...
  call npm run build
  if errorlevel 1 (
    echo [ERRO] Falha ao preparar a interface.
    pause
    exit /b 1
  )
)

echo.
echo ============================================================
echo   Sistema iniciando... o navegador abre sozinho QUANDO o
echo   servidor estiver pronto ^(pode levar alguns segundos^).
echo   Endereco: http://localhost:3001
echo.
echo   NAO FECHE ESTA JANELA enquanto estiver usando o sistema.
echo   Para encerrar, feche esta janela.
echo ============================================================
echo.

REM O proprio servidor abre o navegador quando terminar de subir
set OPEN_BROWSER=1
npm start
pause
