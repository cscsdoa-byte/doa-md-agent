#!/bin/bash
# 서버 배포 한 줄 스크립트.
# 사용:  bash deploy.sh
#
# git pull → systemd 동기화 → uv sync → npm install + build → restart → 검증

set -e
cd "$(dirname "$0")"

# package-lock.json 은 npm install 이 매번 갱신해서 git pull 충돌 유발 → 자동 폐기
git checkout -- web/package-lock.json 2>/dev/null || true

echo "=== [1/6] git pull ==="
git pull --rebase

echo
echo "=== [2/6] systemd unit 동기화 ==="
for f in deploy/doa-md-web.service deploy/doa-md-poll.service deploy/doa-md-poll.timer; do
  if [ -f "$f" ]; then
    sudo cp "$f" "/etc/systemd/system/$(basename $f)"
  fi
done
sudo systemctl daemon-reload

echo
echo "=== [3/6] Python 의존성 ==="
uv sync

echo
echo "=== [4/6] Next.js 빌드 ==="
cd web
npm install --no-audit --no-fund 2>&1 | tail -3
npm run build
cd ..

echo
echo "=== [5/6] 서비스 재시작 ==="
sudo systemctl restart doa-md-web
sleep 5

echo
echo "=== [6/6] 검증 ==="
code=$(curl -sS -L -o /dev/null -w "%{http_code}" http://3.37.214.243/md/ || echo "FAIL")
echo "  http://3.37.214.243/md/  →  $code"
if [ "$code" = "200" ]; then
  echo "  ✓ 배포 성공"
else
  echo "  ⚠️ 응답 비정상 — sudo journalctl -u doa-md-web -n 30 으로 로그 확인"
fi
