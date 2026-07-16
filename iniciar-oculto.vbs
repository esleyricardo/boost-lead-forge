' Lanca o iniciar.ps1 sem nenhuma janela de console visivel.
Set objShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
ps1Path = scriptDir & "\iniciar.ps1"
comando = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & ps1Path & """"
objShell.Run comando, 0, False
