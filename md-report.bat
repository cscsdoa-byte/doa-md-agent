@echo off
chcp 65001 >nul
cd /d %~dp0
echo ============================================================
echo  도아 MD 모니터링 - 폴링 + 리포트 + 슬랙 알림
echo ============================================================
echo.
echo [1/3] 채널 폴링 (RSS) ...
"%USERPROFILE%\.local\bin\uv.exe" run python -m crawler.run crawl
echo.
echo [2/3] events.json dump + 리포트 생성 ...
"%USERPROFILE%\.local\bin\uv.exe" run python -m crawler.run dump-json
"%USERPROFILE%\.local\bin\uv.exe" run python -m crawler.report
echo.
echo [3/3] 슬랙 알림 (필요 시) ...
"%USERPROFILE%\.local\bin\uv.exe" run python -m crawler.notify
echo.
echo 완료. 브라우저 창을 확인하세요.
timeout /t 3 >nul
