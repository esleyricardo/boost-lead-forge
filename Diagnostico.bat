@echo off
title PGFN Devedores - Diagnostico
cd /d "%~dp0"
echo ============================================================
echo   MODO DIAGNOSTICO - janela visivel com todas as etapas
echo   (use quando o sistema nao abrir pelo atalho normal)
echo ============================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1"
echo.
echo ============================================================
echo   Fim do diagnostico. Copie o texto acima (ou os arquivos
echo   log.txt e servidor.log em %%LOCALAPPDATA%%\PGFN-Devedores)
echo   e envie para analise.
echo ============================================================
pause
