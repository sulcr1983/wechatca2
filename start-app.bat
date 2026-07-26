@echo off
chcp 65001 >nul
REM ============================================================
REM  SuperSu 一键启动器
REM  双击本文件：自动装依赖 -> 启动服务 -> 自动打开浏览器
REM  关闭本窗口即停止服务（或按 Ctrl+C）
REM ============================================================
setlocal
cd /d "%~dp0"

set VENV=.\.venv\Scripts\python.exe

REM —— 1) 首次运行：创建虚拟环境并安装全部依赖 ——
if not exist "%VENV%" (
    echo [初始化] 首次运行，正在创建虚拟环境并安装依赖（约 1-3 分钟）...
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
python -c "from playwright.sync_api import sync_playwright; import os,sys; p=sync_playwright().start(); ok=os.path.exists(p.chromium.executable_path); p.stop(); sys.exit(0 if ok else 1)" 2>nul || (
    echo [修复] 检测到浏览器缺失，正在下载 Chromium...
    python -m playwright install chromium
)

echo.
echo ======================================================
echo   SuperSu 正在启动...
echo   浏览器会在 1~2 秒后自动打开 http://127.0.0.1:5000
echo   如果浏览器没自动弹出，请手动打开上面的网址
echo   关闭本窗口即停止服务（或按 Ctrl+C）
echo ======================================================
echo.

python app.py
pause
