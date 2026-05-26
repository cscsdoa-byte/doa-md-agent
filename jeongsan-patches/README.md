# 정산자동화웹 토스쇼핑 fee 보정 patch

## 배경

정산자동화웹의 토스쇼핑 매출은 `orders.fee = 0` 으로 들어옴 (이지어드민이 토스 fee 안 채움).
실제 토스 정산엔 결제 수수료 2.4% + 판매 수수료 8%(광고전환/오늘출발 면제) 적용되어
주문별로 fee 가 다름 → 영업이익 과대 계상 중.

토스 판매자센터의 **건별 정산 내역 csv** 가 이미 분기 처리 후의 정확한 fee 를 주문번호별로
제공하므로, 이걸 업로드해서 `orders.fee` 를 정확한 값으로 채우는 patch.

## 파일

- `parsers/toss_settlement.py` — 토스 정산 csv 파서
- `routers/upload_toss.py` — `POST /api/upload/toss-settlement` endpoint

## 적용 방법 (서버에서)

### 1) doa-md-agent 에서 patch 받기

```bash
cd ~/doa-md-agent && git pull
```

### 2) 정산자동화웹 코드에 복사

```bash
cp ~/doa-md-agent/jeongsan-patches/parsers/toss_settlement.py \
   /home/ubuntu/jeongsan/api/app/parsers/

cp ~/doa-md-agent/jeongsan-patches/routers/upload_toss.py \
   /home/ubuntu/jeongsan/api/app/routers/
```

### 3) main.py 에 라우터 등록

`/home/ubuntu/jeongsan/api/app/main.py` 에서:

```python
# 1. import 추가 (다른 router import 옆에)
from .routers import upload_toss

# 2. app.include_router(...) 호출 추가 (다른 router 등록 옆에)
app.include_router(upload_toss.router, prefix="/api")
```

정확한 import / include 위치는 main.py 의 기존 패턴 그대로 따라가면 됨.

### 4) uvicorn 재시작

```bash
sudo systemctl restart <정산자동화웹-service-name>
# 또는 process 직접 kill 후 재실행 (releases 구조면 새 release 빌드 필요)
```

서비스 이름 확인:
```bash
sudo systemctl list-units --type=service | grep -i jeongsan
```

### 5) 토스 정산 csv 업로드 테스트

토스 판매자센터 → 정산 → "건별 정산 내역" csv 다운 (지급일 범위 지정)

```bash
TOKEN=$(cat ~/doa-md-agent/.env | grep SETTLE_API_TOKEN | cut -d= -f2)

curl -X POST http://localhost:8000/api/upload/toss-settlement \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/건별정산내역.csv"
```

응답 예시:
```json
{
  "csv_orders": 42,
  "orders_updated": 42,
  "not_matched_count": 0,
  "not_matched_sample": [],
  "parse_errors": 0
}
```

### 6) 정산자동화웹 대시보드에서 토스 매출 fee 확인

이전엔 0원 → 이제는 매출의 약 6% 수준으로 정확하게 잡혀야 함.

## 한계

- 주문번호 매칭 실패 케이스 (`not_matched_sample`) 가 많으면 → 토스 csv 의
  주문번호 형식과 이지어드민이 가져오는 `orders.order_no` 형식이 다른 것.
  그 경우 매핑 로직 추가 (예: prefix 제거, 부분 매칭) 필요.

- 토스 정산 지급일은 주문일 + 2영업일이므로, 월별로 csv 다운받을 때
  지급일 범위 vs 매출일 범위 어긋남 인지 필요. **권장: 매월 초 전월 지급일 전체 다운**.

## 워크플로우 (월 1회)

1. 매월 1~5일 사이 토스 판매자센터 → 정산 → 건별 정산 내역 (전월 1~31일 지급일)
2. csv 다운로드
3. 정산자동화웹 /upload 페이지 또는 curl 로 업로드
4. orders.fee 자동 갱신
5. 대시보드 토스 매출 영업이익 정확화
