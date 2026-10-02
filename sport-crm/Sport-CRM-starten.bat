@echo off
chcp 65001 >nul
title Sport-CRM
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ist nicht installiert.
  echo Bitte die LTS-Version von https://nodejs.org installieren und danach diese Datei erneut starten.
  start "" https://nodejs.org
  pause
  exit /b 1
)

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)"
if errorlevel 1 (
  echo Deine Node.js-Version ist zu alt. Benoetigt wird mindestens 22.5 - bitte die aktuelle LTS-Version von https://nodejs.org installieren.
  pause
  exit /b 1
)

echo Sport-CRM wird gestartet. Dieses Fenster offen lassen - Schliessen beendet das CRM.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node --no-warnings=ExperimentalWarning server.js
pause
