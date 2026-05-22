# 도아 MD 에이전트 — AWS 배포 가이드

정산자동화웹(`3.37.214.243`)과 **같은 EC2** 에 `/md/` 서브경로로 배포.

## 1. 사전 준비 (로컬)

`web/next.config.ts` 에 production 일 때 `basePath: "/md"` 설정. 이미 코드에 포함됨.

```bash
# 로컬에서 production 빌드 테스트
cd web
npm run build
npm run start -- -p 3100
# 브라우저 http://localhost:3100/md/ 로 접속해서 동작 확인 후 진행
```

## 2. EC2 SSH 접속 (사용자)

```powershell
# 로컬 PowerShell (윈도우)
ssh -i C:\path\to\key.pem ubuntu@3.37.214.243
```

키 파일 권한이 너무 열려있다고 경고 나오면 PowerShell:
```powershell
icacls C:\path\to\key.pem /inheritance:r /grant:r "$($env:UserName):(R)"
```

## 3. EC2 환경 셋업 (서버)

```bash
# Python uv
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc

# Node.js 22 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# 시스템 의존성 (Playwright 가 chromium 띄울 때 필요)
sudo apt install -y libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
                    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
                    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
                    libcairo2 libasound2t64
```

## 4. 코드 푸시 (로컬 → 서버)

옵션 A — git pull (GitHub 통해):
```bash
# 서버에서:
cd ~
git clone https://github.com/<당신>/doa-md-agent.git
cd doa-md-agent
```

옵션 B — rsync (직접 동기화):
```bash
# 로컬에서 (Git Bash 또는 WSL):
rsync -avz --exclude='.venv' --exclude='node_modules' --exclude='.next' \
      --exclude='data/*.db' --exclude='data/*.json' --exclude='.env' \
      -e "ssh -i C:/path/to/key.pem" \
      /c/Users/User/projects/doa-md-agent/ \
      ubuntu@3.37.214.243:~/doa-md-agent/
```

## 5. 환경변수 (서버)

```bash
cd ~/doa-md-agent
cp .env.example .env
nano .env
# SETTLE_API_TOKEN, SETTLE_USER, SETTLE_PASS, SLACK_WEBHOOK_URL 채움
```

## 6. 의존성 + 빌드 (서버)

```bash
cd ~/doa-md-agent
uv sync
uv run playwright install chromium

cd web
npm install
npm run build
cd ..

# 첫 데이터 생성
uv run python -m crawler.auto_login
uv run python -m crawler.run sync-channels
uv run python -m crawler.run crawl
uv run python -m crawler.run dump-json
```

## 7. systemd 서비스 등록

```bash
sudo cp ~/doa-md-agent/deploy/doa-md-web.service /etc/systemd/system/
sudo cp ~/doa-md-agent/deploy/doa-md-poll.service /etc/systemd/system/
sudo cp ~/doa-md-agent/deploy/doa-md-poll.timer /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable --now doa-md-web
sudo systemctl enable --now doa-md-poll.timer

# 상태 확인
sudo systemctl status doa-md-web
systemctl list-timers --all | grep doa-md
```

## 8. nginx 설정 추가

```bash
# 정산자동화웹이 쓰는 conf 파일 찾기 (보통 default 또는 한 개)
ls /etc/nginx/sites-enabled/
sudo nano /etc/nginx/sites-enabled/default   # 또는 해당 파일

# 정산자동화웹 server { ... } 블록 안에
# deploy/nginx-md.conf 의 location /md/ 블록을 복사해 추가

sudo nginx -t                # 문법 검증
sudo systemctl reload nginx  # 반영
```

## 9. 정산자동화웹 헤더에 "MD 화면" 링크 추가

정산자동화웹 코드(아마 `app/(authed)/layout.tsx`)에 한 줄:

```tsx
<a href="/md/" className="...">📅 MD 화면</a>
```

저장 후 정산자동화웹 빌드/재시작.

## 10. 검증

```
http://3.37.214.243/md/        # 캘린더
http://3.37.214.243/md/contacts
http://3.37.214.243/md/templates
http://3.37.214.243/md/simulator
```

## 운영 명령

```bash
# 로그
sudo journalctl -u doa-md-web -f
tail -f ~/doa-md-agent/data/poll.log

# 재시작
sudo systemctl restart doa-md-web

# 업데이트 (코드 변경 후)
cd ~/doa-md-agent
git pull                       # 또는 rsync
uv sync
cd web && npm install && npm run build && cd ..
sudo systemctl restart doa-md-web
```

## 보안 체크리스트

- [ ] `.env` 파일 권한 600 (`chmod 600 .env`)
- [ ] EC2 보안 그룹: 3100 포트는 외부 차단 (nginx 만 접근)
- [ ] HTTPS — 다음 단계 (Let's Encrypt + certbot)
- [ ] SETTLE_PASS 정기 변경
