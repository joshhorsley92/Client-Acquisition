' TKBS CRM — hidden launcher
' Runs start-crm-server.bat without showing a console window.
' Drop this file (or a shortcut to it) in the Windows Startup folder:
'   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\
'
' To stop the server: taskkill /F /IM node.exe
' To check if running: tasklist | findstr node

Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """C:\Client-Acquisition\tkbs-crm\scripts\start-crm-server.bat""", 0, False
