@echo off
cd /d "%~dp0"
echo Opening the local GALANACCI OS layout editor at:
echo http://127.0.0.1:4174/?entry=pog^&layout=edit
echo.
echo Keep this window open while editing. Press Ctrl+C to stop.
node scripts\layout-editor-server.mjs
pause
