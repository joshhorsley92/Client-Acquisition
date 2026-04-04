@echo off
cd /d "C:\Users\joshh\OneDrive\Turnkey Business Solutions\TKBS - Client Acquisition\Client-Acquisition\tkbs-crm"
node node_modules\jest\bin\jest.js --verbose --forceExit > scripts\test-results.txt 2>&1
echo Exit code: %ERRORLEVEL% >> scripts\test-results.txt
