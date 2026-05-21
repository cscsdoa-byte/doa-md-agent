@echo off
REM 자동 폴링용 — Windows 작업 스케줄러에 등록.
REM 콘솔 출력 안 띄우고 조용히 실행. 슬랙 알림은 중복 방지 캐시 사용.
chcp 65001 >nul
cd /d %~dp0
"%USERPROFILE%\.local\bin\uv.exe" run python -m crawler.run crawl >> data\poll.log 2>&1
"%USERPROFILE%\.local\bin\uv.exe" run python -m crawler.run dump-json >> data\poll.log 2>&1
"%USERPROFILE%\.local\bin\uv.exe" run python -m crawler.notify >> data\poll.log 2>&1
