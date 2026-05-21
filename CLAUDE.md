# 도아 MD 통합 에이전트 — Claude Code 컨텍스트

## 이게 무슨 프로젝트?

도아(주식회사 도아) MD 2인 팀을 위한 **이커머스 행사 모니터링 + 운영 관리 + 마진 시뮬레이션** 에이전트.
조선팔도떡집 등 도아 브랜드들이 12개 판매채널에서 진행하는 행사를 한 화면에서 관리하는 게 목표.

**별도 시스템 — 정산자동화웹**(`http://3.37.214.243`, Next.js + FastAPI, AWS EC2)이 매출/SKU/원가 데이터의 진실의 원천. 이 MD 에이전트는 정산자동화웹의 API를 호출해서 데이터를 끌어다 씀.

## 디렉토리 구조

```
doa-md-agent/
├── .env                  # 토큰/비밀 (gitignore)
├── .env.example          # 템플릿
├── pyproject.toml        # Python (uv 관리)
├── uv.lock
├── md-report.bat         # 더블클릭 → crawl + 리포트 + 슬랙 알림
├── md-poll.bat           # 자동 폴링용 (작업 스케줄러)
│
├── crawler/              # Python 백엔드
│   ├── channels.yaml     # 12개 채널 정의 (RSS/HTML/Playwright 어댑터 분류)
│   ├── run.py            # CLI 진입점 — crawl/list/status/register/sales/sync 등
│   ├── notify.py         # 슬랙 알림
│   ├── report.py         # HTML 리포트 (Next.js 이전 임시 뷰어)
│   ├── store.py          # SQLite CRUD
│   ├── parse.py          # 제목 파서 (카테고리/마감일/도아 적합)
│   └── adapters/         # RSS / HTML / Playwright 어댑터
│
├── api/                  # 정산자동화웹 클라이언트 (Python)
│   ├── settle_client.py  # Bearer JWT 인증
│   ├── settle_probe.py   # 응답 구조 점검
│   ├── sales.py          # 매출 매칭 로직
│   ├── margin.py         # 마진 계산
│   └── margin_cli.py     # CLI: search/calc
│
├── data/                 # SQLite + events.json + 캐시 (gitignore)
│   ├── events.db
│   ├── events.json       # Next.js 가 읽는 dump
│   └── notify_state.json
│
└── web/                  # Next.js 16 + Turbopack + Tailwind
    ├── app/
    │   ├── page.tsx          # 메인 캘린더
    │   ├── simulator/        # 마진 시뮬레이터 (사용자 HTML 포팅)
    │   ├── contacts/         # MD 연락처 CRUD
    │   ├── templates/        # 반복 행사 템플릿
    │   └── api/              # API routes (Python CLI 호출)
    ├── components/
    │   ├── Calendar.tsx      # 월간 그리드, 상세 패널, 신규 행사 폼
    │   ├── Simulator.tsx     # 마진 시뮬레이터
    │   ├── ContactsManager.tsx
    │   └── TemplatesManager.tsx
    └── lib/
        ├── data.ts           # events.json 로드
        ├── channels.ts       # channels.yaml 파싱
        ├── channelTheme.ts   # 채널 약어/색
        ├── season.ts         # 한국 명절/시즌 (떡집 매출 핵심)
        ├── conflict.ts       # 카니발리제이션 검출
        ├── cli.ts            # Python CLI 호출 헬퍼
        └── settle.ts         # 정산자동화웹 SKU 검색
```

## 핵심 데이터 흐름

```
RSS/HTML 크롤  ─┐
              ├→  data/events.db  ─→  dump-json  ─→  data/events.json  ─→  Next.js
사용자 입력 (UI) ─┘                                                            │
                                                                              ↓
                                  API route → child_process(uv run) → Python CLI → DB
```

- **DB가 진실의 원천**. JSON dump는 빌드 산출물.
- 모든 쓰기는 Python CLI를 거침 (API route → cli.ts → runCli).
- 정산자동화웹 호출은 Next.js 서버 측에서 직접 (lib/settle.ts).

## 채널 11개 + 1개

**판매채널** (정산자동화웹에 매출 잡힘 / 입점 예정):
- naver_smartstore (N), kakao_talkstore (K), coupang_wing (C), 11st_soffice (11),
  toss_shopping (T), esmplus (ESM), ns_homeshopping (NS), shoppingnT (엔티)

**정보채널** (행사 공고/인사이트만):
- fanfandaero (F, 정부 지원), sellernow (SN), onmd_mdlounge (O), iboss (보)

채널 약어는 `lib/channelTheme.ts` 가 진실의 원천. yaml은 어댑터/URL 메타.

## 행사 라이프사이클

```
new → reviewing → applied → selected → running → closed
                                                 ↑
                                          skip(패스)
```

행사 객체에 묶을 수 있는 것:
- 상태 + 메모
- 등록 SKU (id/행사가/예상수량)
- 진행기간 (sale_start, sale_end)
- 광고비 (ad_spend_manual)
- 매출 캐시 (sales_json — sales 명령 결과)

## 작업 규칙 (회의록 + 사용자 피드백 반영)

1. **수수료율은 사용자 시뮬레이터 기준**: 쿠팡 10.6 / 네이버 2.73 / 토스 8 / 11번가 13 / G·옥 13 / NS 15 / 카카오 3.3
2. **카니발리제이션 금지** (특히 네이버↔카카오 같은 SKU·같은 기간)
3. **떡집 시즌 핵심**: 추석/설/어버이날 — `lib/season.ts` 에 D-day 자동 계산
4. **광고비는 행사별 직접 입력** (정산자동화웹 ad_spend 는 전 채널 합산이라 부정확)
5. **N/K 채널 약어는 진하게** (color + extrabold)
6. **상태 색은 좌측 4px 막대 + 진한 배경** (한눈에 식별)
7. **MD 직접 행사 등록은 판매채널만**

## 진행 현황 (2026-05-21 시점)

✅ 완료
- 캘린더 (월간 그리드, 도아 적합 필터, 시즌 마크, 카니발 ⚡, D-0 빨간 배너, 라이브 영역)
- 행사 라이프사이클 (status/memo/SKU/기간/매출/광고비 — 우측 패널 UI)
- 행사 본문 수정 + 삭제
- MD 연락처 (/contacts) + 행사 패널 자동 표시
- 반복 행사 템플릿 (/templates) + 새 행사 폼 prefill
- 마진 시뮬레이터 (/simulator) + 정산자동화웹 SKU 검색
- 슬랙 알림 (crawler.notify) + 작업 스케줄러용 md-poll.bat
- 자동 dump-json (write 후 자동 갱신)

⏳ 다음 단계 (우선순위)
1. **채널 마스터 DB + 정산자동화웹 facets 자동 동기화** — 정산자동화웹이 진실의 원천. 사용자 핵심 요구.
2. **AWS 배포 + 토큰 자동 갱신** — localhost 의존 해소. 정산자동화웹과 같은 서버에 `/md/` 경로로.
3. (데이터 누적 후) 채널·카테고리 효율 통계, MD별 행사 성공률
4. A.2 재고 부족 경고 (정산자동화웹 재고 API 확인 필요)

## 셋업 (새 PC에서)

```bash
# 1. Python 환경
winget install --id=astral-sh.uv -e        # uv 설치 (또는 https://astral.sh/uv 가서 install 스크립트)
cd doa-md-agent
uv sync                                      # .venv + 의존성

# 2. Node.js 환경
# Node 22 이상 설치 (https://nodejs.org)
cd web
npm install

# 3. 환경변수
cp ../.env.example ../.env
# .env 의 SETTLE_API_TOKEN 채움 (정산자동화웹 로그인 → DevTools Network → Bearer 토큰)
# 토큰 만료 ~8시간

# 4. 첫 실행
cd ..
uv run python -m crawler.run crawl          # RSS 폴링
uv run python -m crawler.run dump-json      # events.json 생성
cd web && npm run dev                       # http://localhost:3000

# 5. (선택) 작업 스케줄러
# PowerShell 관리자로:
# $action = New-ScheduledTaskAction -Execute "<프로젝트 경로>\md-poll.bat"
# $t1 = New-ScheduledTaskTrigger -Daily -At "9:00am"
# $t2 = New-ScheduledTaskTrigger -Daily -At "2:00pm"
# Register-ScheduledTask -TaskName "DoaMdPoll" -Action $action -Trigger @($t1, $t2)
```

## 알아두면 좋은 함정

1. **Windows 콘솔 cp949** — Python 스크립트는 sys.stdout.reconfigure(encoding="utf-8") 강제.
2. **f-string 안 백슬래시 금지** — Python f-string 안에 `\` 들어가면 SyntaxError. 변수로 분리.
3. **next.config.ts 가 ../.env 로드** — `dotenv.config({ path: "../.env" })` 로 doa-md-agent/.env 를 web/ 에서도 사용.
4. **API 쓰기 흐름** — Next.js route → `runCli([...])` → Python CLI → DB → `refreshDump()` → router.refresh().
5. **dedup_id prefix 6자** — short_id 로 사용. resolve_event() 가 LIKE prefix% 로 매칭, 모호하면 에러.
6. **manual 행사 vs crawl 행사** — delete 는 manual만 기본 허용, crawl 행사는 reset만 (다음 crawl 재수집).
7. **정산자동화웹 토큰 8시간 만료** — SettleClient 401 시 .env 갱신 필요.
8. **카카오 톡스토어 RSS** 는 마감일 제목에 안 들어있어서 "마감미상" 섹션에 표시.

## 참고

- 회의록 (2026-05-20): 토스 면제조건/광고 의존도, 네이버↔카카오 카니발 금지, 토스 두쫀모/콩설기 잘 나옴
- 사용자 시뮬레이터: `C:\Users\User\Downloads\행사 시뮬레이션 계산기.html` — 수수료율 진실의 원천
- 정산자동화웹 메모: `~/.claude/projects/.../memory/project_settlement_automation.md`
- 이 프로젝트 메모: `~/.claude/projects/.../memory/project_doa_md_agent.md`
