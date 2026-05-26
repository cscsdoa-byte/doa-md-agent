#!/bin/bash
# 정산자동화웹에 토스 정산 patch 자동 적용.
# 사용: bash ~/doa-md-agent/jeongsan-patches/apply.sh
set -e

PATCH_DIR="$HOME/doa-md-agent/jeongsan-patches"
JEONGSAN_DIR="/home/ubuntu/jeongsan/api/app"

echo "=== [1/4] 파일 복사 ==="
cp "$PATCH_DIR/parsers/toss_settlement.py" "$JEONGSAN_DIR/parsers/"
cp "$PATCH_DIR/routers/upload_toss.py" "$JEONGSAN_DIR/routers/"
echo "  ✓ parsers/toss_settlement.py"
echo "  ✓ routers/upload_toss.py"

echo
echo "=== [2/4] main.py 라우터 등록 ==="
if grep -q 'upload_toss' "$JEONGSAN_DIR/main.py"; then
    echo "  (이미 등록됨 — 스킵)"
else
    sed -i 's/, uploads$/, uploads, upload_toss/' "$JEONGSAN_DIR/main.py"
    sed -i '/app.include_router(uploads.router)/a\    app.include_router(upload_toss.router)' "$JEONGSAN_DIR/main.py"
    echo "  ✓ import + include_router 추가"
fi

echo
echo "=== [3/4] jeongsan-api 재시작 ==="
sudo systemctl restart jeongsan-api
sleep 3
echo "  ✓ restart 완료"

echo
echo "=== [4/4] endpoint 등록 확인 ==="
code=$(curl -sS -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/upload/toss-settlement || echo "FAIL")
echo "  http://localhost:8000/api/upload/toss-settlement → $code"
if [ "$code" = "401" ] || [ "$code" = "403" ] || [ "$code" = "422" ]; then
    echo "  ✓ endpoint 정상 (인증 필요해서 401 — 기대한 응답)"
elif [ "$code" = "404" ]; then
    echo "  ⚠️ 404 — 라우터 등록 실패. main.py 직접 확인 필요."
    exit 1
else
    echo "  ⚠️ 예상 외 응답 $code"
fi

echo
echo "=== 완료 ==="
echo "이제 http://3.37.214.243/md/toss-upload 페이지에서 csv 업로드 가능."
