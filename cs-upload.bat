@echo off
chcp 65001 >nul
REM 이지데스크 .xls 가장 최근 파일 자동 업로드.
REM 사용: 이지데스크 → 메시지조회 → 엑셀 다운로드 후 이 .bat 더블클릭

set "EZDESK_DIR=%USERPROFILE%\Documents\클로드코드\클로드"
set "SERVER=http://3.37.214.243/md/api/cs-upload"

REM 가장 최근 ezdesk_macro*.xls 찾기
set "LATEST="
for /f "delims=" %%i in ('dir /b /od /a-d "%EZDESK_DIR%\ezdesk_macro*.xls" 2^>nul') do set "LATEST=%%i"

if "%LATEST%"=="" (
    echo.
    echo ❌ ezdesk_macro*.xls 파일이 없습니다
    echo    위치: %EZDESK_DIR%
    echo    이지데스크 → 메시지조회 → 엑셀 다운로드 먼저
    echo.
    pause
    exit /b 1
)

set "FILE=%EZDESK_DIR%\%LATEST%"
echo.
echo ⏳ 업로드 중: %LATEST%
echo    서버: %SERVER%
echo.

curl -s -F "file=@%FILE%" %SERVER% > "%TEMP%\cs_upload_result.json"
set "EXIT=%ERRORLEVEL%"

if not "%EXIT%"=="0" (
    echo ❌ curl 실패 - 서버 연결 확인
    pause
    exit /b 1
)

type "%TEMP%\cs_upload_result.json"
echo.
echo.
echo ✓ 업로드 완료 — 새 답변으로 상품 KB 자동 학습됨 (cs-upload route 가 build-product-kb --smart 호출)
echo   브라우저에서 http://3.37.214.243/md/ 새로고침
echo.
timeout /t 5 >nul
