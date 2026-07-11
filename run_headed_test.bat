@echo off
cd /d d:\test\wechatca2
echo Starting Flask...
start /min /b .venv\Scripts\pythonw.exe start_flask.py
timeout /t 3 /nobreak >nul
echoFlask running at http://127.0.0.1:5000
echo.
echoRunning headed E2E test...
.venv\Scripts\python.exe test_headed_full.py
pause
