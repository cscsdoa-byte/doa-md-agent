@echo off
REM 자동 폴링용 — Windows 작업 스케줄러에 등록.
REM 토큰 자동 갱신 → 채널 폴링 → 행사매출 새로고침 → JSON dump → 슬랙 알림 순서.
chcp 65001 >nul
cd /d %~dp0
"%USERPROFILE%\.local\bin\uv.exe" run python -m crawler.auto_login >> data\token.log 2>&1
"%USERPROFILE%\.local\bin\uv.exe" run python -m crawler.run crawl >> data\poll.log 2>&1
"%USERPROFILE%\.local\bin\uv.exe" run python -m crawler.run sales-all >> data\poll.log 2>&1
"%USERPROFILE%\.local\bin\uv.exe" run python -m crawler.run infer-event-type >> data\poll.log 2>&1
"%USERPROFILE%\.local\bin\uv.exe" run python -m crawler.run infer-md-owner >> data\poll.log 2>&1
"%USERPROFILE%\.local\bin\uv.exe" run python -m crawler.run dump-json >> data\poll.log 2>&1
"%USERPROFILE%\.local\bin\uv.exe" run python -m crawler.notify >> data\poll.log 2>&1
