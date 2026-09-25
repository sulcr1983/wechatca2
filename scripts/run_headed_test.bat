@echo off
chcp 65001 >nul
REM ============================================================
REM  有头浏览器全按钮 E2E 快捷入口
REM  对应 tests/test_headed_full_e2e.py —— 该套件会「自起服务」，
REM  并在端口 5000 已被占用时直接 ABORT（退出码 2）。
REM  所以跑之前请先关掉你自己起的 app.py，否则会连到旧进程假通过。
REM
REM  两条踩过的坑：
REM  1) 不要写死盘符（旧版写的是 d:\test\wechatca2，项目搬家后必然失效）。
REM     用 %~dp0 定位，与项目位置无关。
REM  2) 本文件必须保持 CRLF 换行（见 .gitattributes 的 *.bat eol=crlf）；
REM     裸 LF 会让 cmd 解析错乱。
REM ============================================================
setlocal
cd /d "%~dp0.."

echo.
echo ======================================================
echo   前端有头全按钮 E2E（自起服务，需端口 5000 空闲）
echo ======================================================
echo.

"%~dp0..\.venv\Scripts\python.exe" tests\test_headed_full_e2e.py
pause