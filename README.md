# 도아 MD 통합 에이전트

이커머스 행사 모니터링 + 운영 관리 + 마진 시뮬레이션.
Python(uv) + Next.js 16. 자세한 구조/규칙은 [`CLAUDE.md`](./CLAUDE.md) 참조.

## 빠른 시작 (새 PC)

### 1. 사전 설치

- **Python 3.11+ + uv**
  ```powershell
  irm https://astral.sh/uv/install.ps1 | iex
  ```
- **Node.js 22+** (https://nodejs.org)
- **Git**

### 2. 클론 + 의존성

```bash
git clone <repo URL> doa-md-agent
cd doa-md-agent
uv sync
cd web && npm install && cd ..
```

### 3. 환경변수

```bash
cp .env.example .env
```

`.env` 열어서 채움:
- `SETTLE_API_TOKEN` — 정산자동화웹 Bearer JWT (8시간 만료)
  - `http://3.37.214.243` 로그인 → F12 → Network → 아무 `/api/*` 요청의 `Authorization: Bearer ...` 토큰
- `SLACK_WEBHOOK_URL` (선택) — 자동 알림 활성화 시
- `NOTION_TOKEN` / `NOTION_EVENTS_DB_ID` (선택)

### 4. 첫 실행

```bash
# 채널 폴링 + 데이터 생성
uv run python -m crawler.run crawl
uv run python -m crawler.run dump-json

# 웹 dev 서버
cd web && npm run dev
# → http://localhost:3000
```

`md-report.bat` 더블클릭하면 폴링·리포트·슬랙 알림이 한 번에.

### 5. (선택) 자동 폴링

PowerShell **관리자**로:
```powershell
$path = "C:\path\to\doa-md-agent\md-poll.bat"
$action = New-ScheduledTaskAction -Execute $path
$t1 = New-ScheduledTaskTrigger -Daily -At "9:00am"
$t2 = New-ScheduledTaskTrigger -Daily -At "2:00pm"
Register-ScheduledTask -TaskName "DoaMdPoll" -Action $action -Trigger @($t1, $t2)
```

## 주요 URL

| 경로 | 용도 |
|---|---|
| `/` | 캘린더 (월간 + 라이브/마감/시즌 영역) |
| `/simulator` | 행사 마진 시뮬레이터 (다크 테마) |
| `/contacts` | MD 연락처 |
| `/templates` | 반복 행사 템플릿 |
| `/api/skus?q=…` | 정산자동화웹 SKU 검색 |

## 자주 쓰는 CLI

```bash
uv run python -m crawler.run crawl                    # 채널 폴링
uv run python -m crawler.run dump-json                # JSON 갱신
uv run python -m crawler.run list --doa --upcoming 7  # 마감 임박 도아 적합
uv run python -m crawler.run show <prefix>            # 행사 상세

uv run python -m crawler.notify --dry                 # 슬랙 미리보기
uv run python -m crawler.report                       # HTML 리포트 + 브라우저

uv run python -m api.margin_cli search 밤설기          # SKU 검색
uv run python -m api.margin_cli calc 220 30000 -q 100 # 마진 계산
```

## 문제 해결

- **토큰 만료 (401)** — `.env` 의 `SETTLE_API_TOKEN` 갱신
- **포트 3000 점유** — `taskkill /F /PID <PID>` 후 `npm run dev` 재시작
- **f-string 백슬래시 에러** — Python 3.11+ 에서도 f-string 안의 백슬래시는 금지. 변수로 분리.
- **콘솔 한글 깨짐** — Python 스크립트는 stdout reconfigure(utf-8) 자동 처리. 그래도 깨지면 PowerShell `chcp 65001`.

## 라이센스 / 비고

내부 사용. 토큰/세션 같은 비밀은 절대 commit 금지.
