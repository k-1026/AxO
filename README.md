# 청향 시즌 출시 기획실

계절 기후 → 피부 고민 → 한방 원료 후보를 모아, 기획자가 고른 기준으로 출시 순위를 매기는 웹사이트예요.
데이터는 Supabase에서 읽고, 연결이 없으면 `src/data/fallback.js`의 기본 데이터로 보여 줘요.

## 실행

```bash
npm install
cp .env.example .env   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 채우기
npm run dev
npm run build          # dist/ 생성
```

## Supabase 설정

SQL Editor에서 차례로 실행하세요.

1. `supabase/schema.sql`: 테이블, 인덱스, 읽기 전용 RLS 정책
2. `supabase/seed.sql`: 기본 데이터 (계절, 원료, 디자인, 트렌드 출처, 뷰티 트렌드 수집본)

`seed.sql`은 `npm run seed:sql`로 `src/data/fallback.js`에서 만들어요. 데이터를 바꿨으면 다시 만들어 주세요.

## 구조

```
index.html               화면 마크업
public/IMAGE/            로고·용기 샘플 이미지
src/main.js              데이터 로드 → 앱 시작
src/app.js               후보 만들기, 평가, 화면 그리기
src/config/rules.js      라인 구성, 문구, 페르소나, 추천 조합 같은 기획 규칙
src/utils/text.js        조사·이스케이프 같은 문자열 도우미
src/data/repository.js   Supabase 조회 → 화면용 데이터 모양으로 변환
src/data/fallback.js     기본 데이터 (seed.sql의 원본)
src/lib/supabase.js      Supabase 클라이언트 (.env 사용)
supabase/                schema.sql, seed.sql
scripts/                 seed.sql 생성 스크립트
```

| 테이블 | 내용 |
| --- | --- |
| `seasons`, `season_issues` | 계절, 기후 이슈, 피부 고민, 피부 목적 |
| `herbs`, `herb_designs` | 원료 후보 12종의 점수·근거, 패키지 디자인 |
| `trend_tiers`, `trend_sources` | 트렌드 수집 출처 |
| `herb_trend_snapshots` | 원료별 검색 흐름 수집본 (최신 1행 사용) |
| `beauty_trend_snapshots` | 뷰티 트렌드 수집본 (최신 1행 사용, 새로고침 버튼) |
