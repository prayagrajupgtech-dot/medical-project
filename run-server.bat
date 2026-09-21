@echo off
cd /d D:\medical
start "Server" /b "" node server.js
timeout /t 5 /nobreak >nul
echo Server should be running...
