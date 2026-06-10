@echo off
cd /d "%~dp0"
git add -A
git commit -m "deploy: %date% %time%"
git push
echo.
echo Deployed! Cloudflare will build in ~1-2 min.
pause
