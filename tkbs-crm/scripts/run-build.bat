@echo off
cd /d "C:\Users\joshh\OneDrive\Turnkey Business Solutions\TKBS - Client Acquisition\Client-Acquisition\tkbs-crm\client"
node node_modules\vite\bin\vite.js build > ..\scripts\build-results.txt 2>&1
echo Exit code: %ERRORLEVEL% >> ..\scripts\build-results.txt
