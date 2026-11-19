-- 청향 시즌 출시 기획실 · Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에서 이 파일을 먼저 실행하고, 그다음 seed.sql 을 실행하세요.
-- 다시 실행해도 되도록 IF NOT EXISTS / DROP POLICY IF EXISTS 를 썼어요.

-- ── 계절 ─────────────────────────────────────────────
create table if not exists public.seasons (
  name        text primary key,               -- 봄 · 여름 · 가을 · 겨울
  eng         text not null,                  -- Spring …
  icon        text not null,
  sort_order  int  not null default 0
);

-- 계절별 기후 이슈 → 피부 고민 → 피부 목적
create table if not exists public.season_issues (
  id          bigint generated always as identity primary key,
  season      text not null references public.seasons(name) on update cascade on delete cascade,
  title       text not null,                  -- 기후 이슈 (예: 건조한 공기)
  stat        text not null,                  -- 근거 수치
  concern     text not null,                  -- 피부 고민
  purposes    text[] not null default '{}',   -- 피부 목적 (예: {보습, 민감·장벽})
  sort_order  int  not null default 0
);
create index if not exists season_issues_season_idx on public.season_issues(season, sort_order);

-- ── 원료 후보 ─────────────────────────────────────────
-- 점수 항목은 *_score(1~5, 모르면 null) + *_note(근거) 두 칸으로 나눠요.
create table if not exists public.herbs (
  name                 text primary key,     -- 쑥, 어성초 …
  hanja                text not null default '',
  purposes             text[] not null default '{}',
  words                text not null,        -- 광고에 쓸 수 있는 말
  seasons              text[] not null default '{}',
  color                text not null,
  scent_score          smallint check (scent_score between 1 and 5),
  scent_note           text,
  gb_score             smallint check (gb_score between 1 and 5),   -- 경북 생산 비중
  gb_note              text,
  preempt_score        smallint check (preempt_score between 1 and 5),
  preempt_note         text,
  hanbang_score        smallint check (hanbang_score between 1 and 5),
  hanbang_note         text,
  rival_score          smallint check (rival_score between 1 and 5),
  rival_note           text,
  origin_score         smallint check (origin_score between 1 and 5),
  origin_note          text,
  func                 text,                 -- 기능성 보고 메모
  hanbang_gate_status  text check (hanbang_gate_status in ('PASS','FAIL','UNKNOWN','NA')),
  hanbang_gate_note    text,
  type_gate_status     text check (type_gate_status in ('PASS','FAIL','UNKNOWN','NA')),
  type_gate_note       text,
  sort_order           int not null default 0
);

-- 원료별 패키지 디자인 제안 (원료당 1개)
create table if not exists public.herb_designs (
  herb        text primary key references public.herbs(name) on update cascade on delete cascade,
  main        text not null,                  -- 패키지 팔레트
  cap         text not null,                  -- 라벨 포인트
  liquid      text not null,                  -- 밝은 보조색
  motif       text not null,                  -- leaf · root · flower · berry
  from_label  text not null                   -- 색 설명
);

-- ── 트렌드 출처 ───────────────────────────────────────
create table if not exists public.trend_tiers (
  id          text primary key,               -- signal · case · background
  name        text not null,
  cadence     text not null,
  rule        text not null,
  sort_order  int  not null default 0
);

create table if not exists public.trend_sources (
  id          text primary key,
  name        text not null,
  url         text not null,
  type        text not null,
  tier        text not null references public.trend_tiers(id) on update cascade,
  sort_order  int  not null default 0
);

-- ── 트렌드 수집본 (수집 에이전트가 한 번 돌 때마다 1행씩 추가) ───────
-- 원료별 검색 흐름 (네이버 데이터랩). herbs 예: {"쑥": {"score": 4, "signal": "상승", "change": 1.31}}
create table if not exists public.herb_trend_snapshots (
  id            bigint generated always as identity primary key,
  collected_at  date  not null,
  herbs         jsonb not null,
  created_at    timestamptz not null default now()
);
create index if not exists herb_trend_snapshots_latest_idx on public.herb_trend_snapshots(collected_at desc);

-- 뷰티 트렌드 (version · updatedAt · sourceChecks · items · insights 를 payload 에 그대로 저장)
create table if not exists public.beauty_trend_snapshots (
  id          bigint generated always as identity primary key,
  updated_at  timestamptz not null,
  payload     jsonb not null check (payload ? 'items' and payload ? 'insights'),
  created_at  timestamptz not null default now()
);
create index if not exists beauty_trend_snapshots_latest_idx on public.beauty_trend_snapshots(updated_at desc);

-- ── 권한 (RLS) ───────────────────────────────────────
-- 웹사이트(anon 키)는 읽기만 해요. 데이터 추가·수정은 대시보드나 service_role 키로 하세요.
do $$
declare t text;
begin
  foreach t in array array['seasons','season_issues','herbs','herb_designs','trend_tiers','trend_sources','herb_trend_snapshots','beauty_trend_snapshots']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('grant select on public.%I to anon, authenticated', t);
  end loop;
end $$;
