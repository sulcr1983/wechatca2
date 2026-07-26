@echo off
chcp 65001 >nul
REM ============================================================
REM  SuperSu 一键启动器
REM  双击本文件即可：自动装依赖 -> 启动服务 -> 打开浏览器
REM  关闭本窗口即停止服务（或按 Ctrl+C）
REM ============================================================
setlocal
cd /d "%~dp0"

set VENV=.\.venv\Scripts\python.exe

REM —— 1) 首次运行：创建虚拟环境并安装全部依赖 ——
if not exist "%VENV%" (
    echo [初始化] 首次运行，正在创建虚拟环境并安装依赖（约需 1-3 分钟）...
    python -m venv .venv
    call .venv\Scripts\activate.bat
    python -m pip install --upgrade pip
    python -m pip install -r requirements.txt
    python -m playwright install chromium
) else (
    call .venv\Scripts\activate.bat
)

REM —— 2) 防御性自检：依赖或浏览器缺失则自动补装 ——
python -c "import flask, playwright" 2>nul || (
    echo [修复] 检测到依赖缺失，正在重新安装...
    python -m pip install -r requirements.txt
)
python -c "from playwright.sync_api import sync_playwright; sync_playwright().start().stop()" 2>nul || (
    echo [修复] 检测到浏览器缺失，正在下载 Chromium...
    python -m playwright install chromium
)

REM —— 3) 交给启动器开浏览器，避免与 app.py 内置自动打开重复 ——
set SUPERSU_NO_AUTOBROWSER=1

echo.
echo ======================================================
echo   SuperSu 正在启动...
echo   稍后会自动打开浏览器： http://127.0.0.1:5000
echo   本窗口关闭即停止服务（或按 Ctrl+C）
echo ======================================================
echo.

REM 等服务起来后再开浏览器（更稳，避免端口未就绪）
start "" /min powershell -NoProfile -Command "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:5000'"

python app.py
pause
