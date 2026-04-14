@echo off
:: ============================================================
::  SubtitleAI — Windows Setup & Diagnostic Script
::  Run this ONCE before starting app.py
::  Usage:  Double-click  OR  run from cmd:  setup_windows.bat
:: ============================================================
title SubtitleAI Setup

echo.
echo  ============================================
echo   SubtitleAI - Windows Setup Check
echo  ============================================
echo.

:: ── 1. Python ────────────────────────────────────────────────
echo [1/4] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo  ERROR: Python not found!
    echo  Download from https://www.python.org/downloads/
    echo  Make sure to check "Add Python to PATH" during install.
    pause & exit /b 1
)
python --version
echo  OK

:: ── 2. pip install ───────────────────────────────────────────
echo.
echo [2/4] Installing Python packages...
python -m pip install --upgrade pip --quiet
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo  ERROR: pip install failed. Check your internet connection.
    pause & exit /b 1
)
echo  OK

:: ── 3. ffmpeg ────────────────────────────────────────────────
echo.
echo [3/4] Checking ffmpeg...
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  WARNING: ffmpeg not found on PATH!
    echo.
    echo  SubtitleAI needs ffmpeg to convert MP3/M4A files.
    echo.
    echo  OPTION A ^(Recommended^) - winget ^(Windows 10/11^):
    echo    Open a NEW PowerShell window as Administrator and run:
    echo    winget install --id=Gyan.FFmpeg -e
    echo.
    echo  OPTION B - Manual install:
    echo    1. Go to https://www.gyan.dev/ffmpeg/builds/
    echo    2. Download "ffmpeg-release-essentials.zip"
    echo    3. Extract to C:\ffmpeg\
    echo    4. Add C:\ffmpeg\bin to your Windows PATH:
    echo       - Search "Environment Variables" in Start Menu
    echo       - Edit "Path" under System Variables
    echo       - Add new entry: C:\ffmpeg\bin
    echo    5. Restart this script
    echo.
    echo  NOTE: WAV files will still work without ffmpeg.
    echo        MP3 and M4A files require ffmpeg.
    echo.
) else (
    ffmpeg -version 2>&1 | findstr /i "ffmpeg version"
    echo  OK
)

:: ── 4. Internet (Google Speech API) ─────────────────────────
echo.
echo [4/4] Checking internet connection...
ping -n 1 8.8.8.8 >nul 2>&1
if errorlevel 1 (
    echo  WARNING: No internet detected.
    echo  Google Speech Recognition requires internet access.
    echo  Make sure you are connected before generating subtitles.
) else (
    echo  OK
)

:: ── Done ─────────────────────────────────────────────────────
echo.
echo  ============================================
echo   Setup complete! Starting SubtitleAI...
echo   Open http://localhost:5000 in your browser
echo  ============================================
echo.

python app.py
pause
