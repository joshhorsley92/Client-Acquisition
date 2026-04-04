@echo off
cd /d "C:\Users\joshh\OneDrive\Turnkey Business Solutions\TKBS - Client Acquisition\Client-Acquisition\tkbs-crm"
node scripts\init-db.js > scripts\setup-results.txt 2>&1
echo Exit code: %ERRORLEVEL% >> scripts\setup-results.txt
