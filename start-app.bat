@echo off
REM ============================================================
REM  SuperSu launcher
REM  Double-click: install deps -> start server -> open browser
REM  Close this window (or press Ctrl+C) to stop the server.
REM
REM  HARD CONSTRAINTS when editing this file (see AGENTS.md, section 4):
REM  1) Always call .venv\Scripts\python.exe via %~dp0 absolute path.
REM     Never rely on activate.bat: it hard-codes the absolute path
REM     from creation time and breaks when the project moves.
REM  2) Keep this file CRLF (*.bat eol=crlf in .gitattributes).
REM  3) KEEP THIS FILE PURE ASCII. cmd.exe mis-parses multi-byte lines
REM     (chcp 65001) and eats the start of following lines, printing
REM     "'xxx' is not recognized" fragments. Chinese user-facing text
REM     lives in app.py / documentation instead.
REM ============================================================
setlocal
cd /d "%~dp0"

set VENV=%~dp0.venv\Scripts\python.exe

REM 1) First run: create venv and install dependencies
if not exist "%VENV%" (
    echo [setup] First run: creating venv and installing dependencies...
    python -m venv .venv
    "%VENV%" -m pip install --upgrade pip
    "%VENV%" -m pip install -r requirements.txt
)

REM 2) Self-check: reinstall if Python dependencies are missing.
REM    No stderr redirect here: "2>nul" device redirects are unreliable
REM    on some machines (false "path not found", rc=1, 2026-10-13).
REM    On real failures the import traceback stays visible on purpose.
"%VENV%" -c "import flask, playwright"
if errorlevel 1 (
    echo [fix] Missing dependencies, reinstalling...
    "%VENV%" -m pip install -r requirements.txt
)

REM 3) Launcher owns the browser opening (avoid double-open by app.py)
set SUPERSU_NO_AUTOBROWSER=1

echo.
echo ======================================================
echo   SuperSu is starting up...
echo   The browser will open automatically in a moment.
echo   Close this window (or press Ctrl+C) to stop.
echo ======================================================
echo.

REM Open the default browser after the port is ready
start "" cmd /c "timeout /t 2 /nobreak >/dev/null & start http://127.0.0.1:5000"

"%VENV%" app.py
pause
