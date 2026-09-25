@echo off
chcp 65001 >nul
REM ============================================================
REM  SuperSu 一键启动器
REM  双击本文件：自动装依赖 -> 启动服务 -> 自动打开浏览器
REM  关闭本窗口即停止服务（或按 Ctrl+C）
REM
REM  两条踩过的坑，改动本文件时务必保留：
REM  1) 全程用「绝对路径调用 .venv\Scripts\python.exe」，不依赖 activate.bat。
REM     activate.bat 里写死了创建虚拟环境时的绝对路径，项目一换目录就失效，
REM     python 会落到系统解释器上，报 No module named 'flask'（曾导致双击无反应）。
REM     用 %~dp0 拼绝对路径则与项目位置无关。
REM  2) 本文件必须保持 CRLF 换行（见 .gitattributes 的 *.bat eol=crlf）。
REM     裸 LF 会让 cmd 解析错乱，把行切成半截命令。
REM ============================================================
setlocal
cd /d "%~dp0"

set VENV=%~dp0.venv\Scripts\python.exe

REM 1) 首次运行：创建虚拟环境并安装全部依赖
if not exist "%VENV%" (
    echo [初始化] 首次运行，正在创建虚拟环境并安装依赖（约 1-3 分钟）...
    python -m venv .venv
    "%VENV%" -m pip install --upgrade pip
    "%VENV%" -m pip install -r requirements.txt
    "%VENV%" -m playwright install chromium
)

REM 2) 防御性自检：依赖或浏览器缺失则自动补装
"%VENV%" -c "import flask, playwright" 2>nul || (
    echo [修复] 检测到依赖缺失，正在重新安装...
    "%VENV%" -m pip install -r requirements.txt
)
"%VENV%" -c "from playwright.sync_api import sync_playwright; import os,sys; p=sync_playwright().start(); ok=os.path.exists(p.chromium.executable_path); p.stop(); sys.exit(0 if ok else 1)" 2>nul || (
    echo [修复] 检测到浏览器缺失，正在下载 Chromium...
    "%VENV%" -m playwright install chromium
)

REM 3) 由启动器负责开浏览器，避免与 app.py 内置自动打开重复
set SUPERSU_NO_AUTOBROWSER=1

echo.
echo ======================================================
echo   SuperSu 正在启动，浏览器马上自动打开...
echo   （若未自动弹出，请手动访问 http://127.0.0.1:5000）
echo   关闭本窗口即停止服务（或按 Ctrl+C）
echo ======================================================
echo.

REM 等服务就绪后自动打开默认浏览器（独立窗口等待 2 秒再弹，避免端口未就绪）
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:5000"

"%VENV%" app.py
pause