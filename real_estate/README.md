# 서울 아파트 실거래 신호 탐지 (Real Estate Signal Detection)

기존 GROW QUEST 앱에 완전히 독립적으로 추가된 실거래 신호 탐지 기능입니다.

---

## 📌 데이터 출처 — 매매 전용입니다

수집 대상은 **국토교통부 아파트 매매 실거래가** 단일 API 입니다.

| 구분 | 엔드포인트 | 이 기능에서 사용 |
|---|---|---|
| 아파트 **매매** 실거래가 | `RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade` | ✅ 사용 |
| 아파트 **전월세** 실거래가 | `RTMSDataSvcAptRent/getRTMSDataSvcAptRent` | ❌ 미사용 |

전월세 API 는 금액을 `deposit`(보증금) / `monthlyRent`(월세) 필드로 내려주지만,
`re_parser.mjs` 는 매매 전용 필드인 `dealAmount` 만 읽습니다.
수집 원본 144,447건 전수 확인 결과 전월세 관련 필드는 존재하지 않습니다.
**즉 전세 보증금이 매매가로 섞여 들어올 수 있는 경로는 없습니다.**

### 그렇다면 20억짜리 목록에 6~7억이 섞여 보이는 이유는?

세 가지이며, 모두 2026-08-16 수정본에서 처리되었습니다.

1. **같은 지번에 서로 다른 건물이 존재** — 예: 성동구 성수동2가 834번지에는
   현대I-PARK(12.5~24.3억, 47건)와 삼성홈타운(1.5~3.2억, 8건)이 함께 등록되어 있습니다.
   `complex_key` 가 사실상 `지번` 단위였기 때문에 두 건물이 한 단지로 합쳐졌습니다.
2. **상세 조회가 평형을 걸러내지 않음** — 같은 단지라도 20평 6억과 40평 20억은 정상입니다.
   `re_get_deal_history` 가 단지+평형 두 축으로 모두 필터링하도록 재정의했습니다.
3. **증여성 직거래** — 동일 단지·동일 평형인데 중앙값의 절반 이하인 거래 47건을 확인했으며,
   그중 81%가 `직거래` 였습니다. 신호 계산에서는 이미 제외되지만 상세 표에는 노출되므로
   `계산 제외` 배지를 붙였습니다.

> 검증 근거: 지번+단지명+전용면적으로 정확히 묶으면 최고가/최저가가 3배 이상 벌어지는
> 그룹은 **0.0%** 입니다. 제대로 묶으면 한 화면에 20억과 6억이 함께 나올 수 없습니다.

### 실사례 — 마포래미안푸르지오3단지 60㎡ 상세 화면

수정 전 화면에 섞여 있던 2~3억 거래를 수집 원본 144,447건에서 전수 추적한 결과,
**마포구가 아닌 다른 구의 거래**였습니다.

| 화면에 보이던 행 | 실제 정체 |
|---|---|
| 2026-05-20 · 3억6,500 · 61.67㎡ | **관악구 봉천동** `(685-103)` 2005년 준공 |
| 2026-05-12 · 2억7,900 · 59.04㎡ | **구로구 구로동** `(806-62)` 1996년 준공 |
| 2026-04-11 · 2억3,000 · 58.05㎡ | **구로구 구로동** `(743-55)` 1996년 준공 |
| 2026-03-30 · 3억 · 58.95㎡ | **구로구 구로동** `(780-41)` 1995년 준공 |

이름이 `(지번)` 뿐인 나홀로아파트로, 해당 지역 시세로는 지극히 정상적인 매매가입니다.
단지명 정규화가 깨져 키가 뭉개진 상태에서 상세 조회가 평형만 느슨하게 맞춰
전혀 다른 구의 거래를 끌어온 것입니다.

수정 후 동일 조회 결과는 마포래미안푸르지오3단지 59.92~59.98㎡ · 20.2억~21.3억 만 반환합니다.
표본도 5건 → 21건으로 정상화되었습니다.

---

## 🐞 2026-08-16 수정 내역

### 1. `scripts/fast_calculate_signals.mjs`

| 버그 | 증상 | 수정 |
|---|---|---|
| 정규식 이스케이프 깨짐 | 템플릿 리터럴에서 `'\(.*\)'` 의 백슬래시가 JS 단계에서 소실 → Postgres 에 `'(.*)'` 전달 → 단지명 정규화 결과가 통째로 빈 문자열 | `String.raw` 로 고정 |
| `ON CONFLICT` 중복행 | `signal_key` 는 원본 `area`(84.93/84.97) 기준인데 PK 는 `ROUND(area)`(85) 기준 → 한 INSERT 안에서 같은 PK 를 두 번 건드려 `ON CONFLICT DO UPDATE command cannot affect row a second time` 발생. **해당 구 전체가 0건 적재** | 그룹 기준을 `ROUND(area)` 로 통일 |
| 오류 은폐 | `execSql` 이 `res.ok` 를 검사하지 않고 에러를 로그만 찍고 넘어가 배치가 "완료"로 보고됨 | 예외 발생 + 구별 적재 건수 검증 + 실패 요약 출력 |
| 보안 | 클라이언트에 노출된 anon 키로 임의 SQL 실행 | `SUPABASE_SERVICE_ROLE_KEY` 환경변수 필수화 |
| **해제거래가 정상 거래로 살아남음** | 국토부는 해제된 계약을 "취소 전 정상 레코드 + 해제 레코드" 두 건으로 내려줍니다. `is_canceled` 만 보면 정상 사본이 신호 계산에 그대로 들어갑니다. 수집 원본에서 **[정상+해제] 혼합 자연키 그룹 5,969개(12,715행, 전체의 8.8%)** 확인 | 동일 자연키(지번+면적+층+계약일+금액)에 해제 기록이 하나라도 있으면 모든 사본을 해제 처리(`eff_canceled`). `cancel_rate` 계산도 동일 기준으로 정정 |
| **이름이 지번뿐인 단지의 키가 빈 문자열** | `(685-103)` 처럼 이름이 괄호뿐인 나홀로아파트 85개(193건)가 괄호 제거 후 이름이 통째로 사라짐 | 정규화 결과가 비면 괄호를 지우지 않은 원본으로 폴백 (`(685-103)` → `685103`) |

실데이터 검증(성동구 6,375건): **구버전 0건 → 수정본 133건**

### 2. `re_rpc_fix.sql` (신규)

`re_get_signals` / `re_get_deal_history` 를 재정의하고, `complex_key` 계산식을
배치 스크립트와 **완전히 동일한 함수**(`re_complex_key`)로 통일했습니다.
`re_exec_sql` 의 anon 권한 회수, RLS 정리도 포함됩니다.

### 3. `re_ui.js`

- 기준일 `2026-08-17` 하드코딩 제거 (헤더 표기 + '최근 N일' 필터가 날짜 경과 시 어긋남)
- 인증 우회(`autoSetDevAuth`)를 `localhost` 에서만 동작하도록 제한
- `MutationObserver` 가 카드 등록 후에도 계속 살아 있던 문제 → 등록 즉시 해제
- 상세 모달을 열 때마다 click 리스너가 누적되던 누수 → 최초 1회만 바인딩
- 자치구 변경 시 서버 재조회를 하지 않아 '전체'로 되돌리면 데이터가 비던 문제
- `drop_rate` 가 음수(상승)일 때 `--5.7%` 로 표시되던 문제

### 4. `netlify/functions/re_api.mjs`

RLS 는 켜져 있는데 정책이 없어 REST 직접 조회가 **항상 200 OK + 빈 배열**을
반환하던 문제 → `SECURITY DEFINER` RPC 경유로 변경.

---

## ▶️ 적용 순서

```bash
# 1) Supabase SQL Editor 에서 실행
#    real_estate/re_rpc_fix.sql 전체 붙여넣기 → Run

# 2) 신호 재계산 (service_role 키 필요)
cd real_estate/scripts
SUPABASE_SERVICE_ROLE_KEY='<service_role 키>' node fast_calculate_signals.mjs
```

배치 실행 시 구별 적재 건수가 출력되며, 0건이거나 실패한 구는 마지막에 요약됩니다.

---

## 🔍 검색 기능 (2026-08-16 추가)

`re_search_upgrade.sql` → `re_search_v2.sql` 순서로 실행하면 활성화됩니다.

- **검색어 없을 때**: `re_get_signals` — 하락 신호만, 기본 30점 이상
- **검색어 있을 때**: `re_search_complexes` — **국토부 원본(re_deals)** 을 뒤져
  신호가 없는 평형까지 전부 표시 (신호 없는 행은 `신호없음` 배지)

단지명·동·구를 한 번에 찾고, 공백을 무시하며(`마포센트럴아이파크` = `마포센트럴 아이파크`),
여러 단어는 AND 조건입니다. `LIKE` 대신 `strpos` 를 써서 `%`, `_`, 따옴표가 들어와도 안전합니다.

### 왜 검색을 원본까지 확장했나

`re_signals` 에는 "하락 신호가 잡힌 (단지×평형)" 만 저장됩니다:

```
(단지 × 평형) 조합 15,259개
  ├ 표본 3건 미만으로 탈락      8,045개 (52.7%)
  ├ 최근 180일 거래 없어 탈락   1,165개 (7.6%)
  └ 신호 생성 대상             6,049개 (39.6%)
       └ 그중 점수가 음수라 미저장 (WHERE score >= 0)  2,384개
          → 실제 저장 3,665건
```

그래서 용산더프라임(11개 평형)은 43평 하나만 검색되었습니다.
26평은 값이 20% *올라서* -35점, 38평은 보합에 해제율 감점으로 -20점이라 저장되지 않았습니다.
`re_search_complexes` 는 이 제약을 우회해 11개 평형을 모두 보여줍니다.

성능: 로컬 15,881행 기준 20~110ms. 실 데이터(약 144,000행)에서도 1초 이내로 예상됩니다.

---

## 🛠️ 기능 롤백 (완전 원상복구) 절차

이 기능의 모든 파일은 완전 독립적으로 작성되어 있으며, 필요 시 본 기능을 완전히 삭제하고 앱을 원상복구하려면 다음 4단계를 순서대로 수행합니다:

1. **기능 전용 폴더 삭제**:
   ```bash
   rm -rf real_estate/
   ```

2. **서버리스 함수 삭제**:
   ```bash
   rm -f netlify/functions/re_*.mjs
   ```

3. **기능 진입점 스크립트 제거 (`index.html`)**:
   `index.html` 하단 `</body>` 직전에 추가했던 단 한 줄의 스크립트 태그를 삭제합니다.
   ```diff
   -  <script src="real_estate/re_ui.js"></script>
   ```

4. **Supabase 전용 테이블 및 함수 삭제**:
   Supabase SQL Editor 에서 아래 DDL 쿼리를 실행합니다.
   ```sql
   DROP TABLE IF EXISTS re_deals, re_complexes, re_signals, re_watchlist, re_config CASCADE;
   DROP FUNCTION IF EXISTS re_get_signals(TEXT, INT, TEXT, TEXT, INT);
   DROP FUNCTION IF EXISTS re_search_complexes(TEXT, TEXT, INT);
   DROP FUNCTION IF EXISTS re_get_deal_history(TEXT, NUMERIC);
   DROP FUNCTION IF EXISTS re_complex_key(TEXT, TEXT, TEXT);
   DROP FUNCTION IF EXISTS re_norm_name(TEXT);
   DROP FUNCTION IF EXISTS re_exec_sql(TEXT);
   ```

위 4단계를 수행하면 기존 앱의 모든 데이터 및 코드가 단 1줄의 흔적도 없이 원상복구됩니다.

---

## 📁 파일 구조

```
real_estate/
├── README.md               # 롤백 절차 및 개요 문서
├── re_schema.sql           # 전용 DB 스키마 & RLS 정책 DDL
├── re_rpc_fix.sql          # 조회 RPC 재정의 + 권한/RLS 정리 (2026-08-16 추가)
├── re_parser.mjs           # 국토부 XML 파서 (매매 전용)
├── re_service.mjs          # 수집 + Supabase 적재 파이프라인
├── re_styles.css           # 전용 스타일 (모든 클래스 re- 접두사)
├── re_ui.js                # 자기등록형(Self-Registration) 히든 메뉴 UI 및 뷰 오버레이
└── scripts/
    ├── fast_calculate_signals.mjs  # 서울 25개 구 전범위 신호 산출 배치 (권장)
    ├── calculate_signals.mjs       # 구버전 행단위 배치 (느림, 참고용)
    └── initial_load.mjs            # 25개 구 x 24개월 초기 수집 및 적재

netlify/functions/
├── re_api.mjs                  # 신호 목록 조회 프록시
├── re_collector.mjs            # 단일 구(LAWD_CD 1개) 수집 서버리스 API
└── re_scheduled_collector.mjs  # 일 1회 구별 분할 증분 배치 스케줄러
```
