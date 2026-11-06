@echo off
setlocal
title GALANACCI Playlist Downloader
py -3.12 -c "import tkinter" >nul 2>&1
if not errorlevel 1 (
    py -3.12 "%~dp0playlist_launcher.py"
    goto :finished
)
py -3 -c "import sys, tkinter; assert sys.version_info >= (3, 11)" >nul 2>&1
if not errorlevel 1 (
    py -3 "%~dp0playlist_launcher.py"
    goto :finished
)
echo Install Python 3.12 from python.org with the Python launcher and Tcl/Tk enabled.
echo Then double-click START_DOWNLOADER.bat again.
pause
exit /b 1
:finished
if errorlevel 1 pause
endlocal
