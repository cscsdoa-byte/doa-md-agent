@echo off
REM 정산자동화웹 토큰 자동 갱신.
REM 7시간 주기로 작업 스케줄러 등록 권장 (8시간 만료 - 1시간 여유).
chcp 65001 >nul
cd /d %~dp0
"%USERPROFILE%\.local\bin\uv.exe" run python -m crawler.auto_login >> data\token.log 2>&1
