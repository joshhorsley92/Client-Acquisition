@echo off
REM ============================================================================
REM  TKBS CRM Production Server — auto-restart wrapper
REM  Runs NODE_ENV=production node server/index.js with crash recovery.
REM  Logs to tkbs-crm\logs\crm-server.log (creates dir if missing).
REM
REM  Registered as a Windows Scheduled Task (runs at user login).
REM  To stop: taskkill /F /IM node.exe (or kill the scheduled task).
REM  To disable permanently: Task Scheduler → TKBS-CRM-Server → Disable.
REM ============================================================================

set CRM_DIR=C:\Client-Acquisition\tkbs-crm
set NODE_PATH=C:\Program Files\nodejs\node.exe
set LOG_DIR=%CRM_DIR%\logs

REM Create logs directory if it doesn't exist
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

cd /d "%CRM_DIR%"

REM Load .env vars manually since dotenv only works inside Node
set NODE_ENV=production

echo [%date% %time%] CRM server starting... >> "%LOG_DIR%\crm-server.log"

:loop
echo [%date% %time%] Starting node server/index.js >> "%LOG_DIR%\crm-server.log"

REM Run the server. If it crashes, control returns here.
"%NODE_PATH%" server/index.js >> "%LOG_DIR%\crm-server.log" 2>&1

echo [%date% %time%] Server exited (code %ERRORLEVEL%). Restarting in 5 seconds... >> "%LOG_DIR%\crm-server.log"

REM Wait 5 seconds before restart to avoid tight crash loops
timeout /t 5 /nobreak > nul

goto loop
