@echo off
rem ===========================================================================
rem  run-sla.cmd - extrai o SLA do ciclo do Jira e monta dist\SLA_Painel.html
rem  Tela separada, so local (validacao). Nao faz parte do fluxo do GitHub.
rem  Uso:  run-sla.cmd
rem ===========================================================================
setlocal
cd /d "%~dp0"

set "NODE="
for /f "delims=" %%i in ('where node.exe 2^>nul') do if not defined NODE set "NODE=%%i"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE (
  echo ERRO: node.exe nao encontrado no PATH nem em %ProgramFiles%\nodejs
  exit /b 9
)

"%NODE%" extract\sla.js
if errorlevel 1 (
  echo ERRO na extracao - tela anterior preservada
  exit /b 1
)
"%NODE%" build-sla.js
if errorlevel 1 exit /b 2
exit /b 0
