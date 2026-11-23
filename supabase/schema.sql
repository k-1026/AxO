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

-- ── 재추천 기록 (로그인 사용자에게 이미 보여 준 후보 라인) ──────────
-- line_key = '원료|목적' (예: 감초|진정). 본인 기록만 읽고 쓸 수 있어요.
create table if not exists public.recommendation_history (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  season      text not null,
  line_key    text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, season, line_key)
);
alter table public.recommendation_history enable row level security;
drop policy if exists "본인 재추천 기록 읽기" on public.recommendation_history;
create policy "본인 재추천 기록 읽기" on public.recommendation_history for select to authenticated using (user_id = auth.uid());
drop policy if exists "본인 재추천 기록 쓰기" on public.recommendation_history;
create policy "본인 재추천 기록 쓰기" on public.recommendation_history for insert to authenticated with check (user_id = auth.uid());

-- ── 트렌드 컬러 팔레트 (계절별, 디자인·광고 에이전트가 최신 1행을 써요) ──────
-- 모두 읽을 수 있고, 쓰기는 관리자(SQL Editor)만 해요. 사용자용 쓰기 정책은 두지 않아요.
create table if not exists public.color_trends (
  id          uuid primary key default gen_random_uuid(),
  season      text not null,                  -- 봄 · 여름 · 가을 · 겨울
  name        text not null,                  -- 팔레트 이름
  colors      text[] not null default '{}',   -- 색 hex 목록 (예: {#A8C3A0,#F2E8D5})
  source      text,                           -- 출처 이름
  url         text,                           -- 출처 URL
  as_of       date not null,                  -- 기준일
  created_at  timestamptz not null default now()
);
create index if not exists color_trends_season_idx on public.color_trends(season, as_of desc);
alter table public.color_trends enable row level security;
drop policy if exists "public read" on public.color_trends;
create policy "public read" on public.color_trends for select to anon, authenticated using (true);
revoke all on public.color_trends from anon, authenticated;
grant select on public.color_trends to anon, authenticated;

-- ── 기획안 (로그인 사용자 본인 것만) ─────────────────────────
-- image_regens = 이미지 [다시 만들기] 횟수. 사용자가 직접 고치지 못하게 칸별 권한만 줘요(아래 grant).
create table if not exists public.plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  season        text,
  herb          text,
  purpose       text,
  title         text,
  image_regens  int  not null default 0 check (image_regens >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists plans_user_updated_idx on public.plans(user_id, updated_at desc);
create index if not exists plans_user_created_idx on public.plans(user_id, created_at);
alter table public.plans enable row level security;
drop policy if exists "본인 기획안 읽기" on public.plans;
create policy "본인 기획안 읽기" on public.plans for select to authenticated using (user_id = auth.uid());
drop policy if exists "본인 기획안 쓰기" on public.plans;
create policy "본인 기획안 쓰기" on public.plans for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "본인 기획안 수정" on public.plans;
create policy "본인 기획안 수정" on public.plans for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "본인 기획안 삭제" on public.plans;
create policy "본인 기획안 삭제" on public.plans for delete to authenticated using (user_id = auth.uid());
-- 칸별 권한: 넣을 때는 내용 칸만, 고칠 때는 제목·수정일만. (user_id·created_at·image_regens 는 손대지 못해요)
revoke all on public.plans from anon, authenticated;
grant select, delete on public.plans to authenticated;
grant insert (season, herb, purpose, title) on public.plans to authenticated;
grant update (title, updated_at) on public.plans to authenticated;

-- 기획안 버전 (수정할 때마다 새 번호로 1행 추가, 고치거나 지우지 않아요)
create table if not exists public.plan_versions (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.plans(id) on delete cascade,
  version_no    int  not null check (version_no >= 1),
  content       jsonb not null,               -- plan + scenarios + candidate 값
  source        text not null check (source in ('generate','edit')),
  edit_request  text,                         -- 수정 요청 글
  created_at    timestamptz not null default now(),
  unique (plan_id, version_no)
);
alter table public.plan_versions enable row level security;
drop policy if exists "본인 기획안 버전 읽기" on public.plan_versions;
create policy "본인 기획안 버전 읽기" on public.plan_versions for select to authenticated
  using (exists (select 1 from public.plans p where p.id = plan_versions.plan_id and p.user_id = auth.uid()));
drop policy if exists "본인 기획안 버전 쓰기" on public.plan_versions;
create policy "본인 기획안 버전 쓰기" on public.plan_versions for insert to authenticated
  with check (exists (select 1 from public.plans p where p.id = plan_versions.plan_id and p.user_id = auth.uid()));
revoke all on public.plan_versions from anon, authenticated;
grant select, insert on public.plan_versions to authenticated;

-- 버전별 이미지 경로 (시나리오 0~2). 파일은 저장소 버킷 plan-images 에 있어요.
create table if not exists public.plan_images (
  version_id  uuid not null references public.plan_versions(id) on delete cascade,
  idx         int  not null check (idx between 0 and 2),
  path        text not null,                  -- {user_id}/{plan_id}/{version_no}-{idx}.png
  created_at  timestamptz not null default now(),
  primary key (version_id, idx)
);
alter table public.plan_images enable row level security;
drop policy if exists "본인 기획안 이미지 읽기" on public.plan_images;
create policy "본인 기획안 이미지 읽기" on public.plan_images for select to authenticated
  using (exists (select 1 from public.plan_versions v join public.plans p on p.id = v.plan_id
                 where v.id = plan_images.version_id and p.user_id = auth.uid()));
drop policy if exists "본인 기획안 이미지 쓰기" on public.plan_images;
create policy "본인 기획안 이미지 쓰기" on public.plan_images for insert to authenticated
  with check (split_part(path, '/', 1) = auth.uid()::text
              and exists (select 1 from public.plan_versions v join public.plans p on p.id = v.plan_id
                          where v.id = plan_images.version_id and p.user_id = auth.uid()));
drop policy if exists "본인 기획안 이미지 수정" on public.plan_images;
create policy "본인 기획안 이미지 수정" on public.plan_images for update to authenticated
  using (exists (select 1 from public.plan_versions v join public.plans p on p.id = v.plan_id
                 where v.id = plan_images.version_id and p.user_id = auth.uid()))
  with check (split_part(path, '/', 1) = auth.uid()::text
              and exists (select 1 from public.plan_versions v join public.plans p on p.id = v.plan_id
                          where v.id = plan_images.version_id and p.user_id = auth.uid()));
revoke all on public.plan_images from anon, authenticated;
grant select, insert, update on public.plan_images to authenticated;

-- 이미지 [다시 만들기] 횟수를 한 번에 1 늘려요. 본인 기획안이 아니면 null 을 돌려줘요.
-- 사용자는 image_regens 칸을 직접 고칠 수 없어서, 이 함수(만든 사람 권한)로만 늘릴 수 있어요. 줄이는 방법은 없어요.
create or replace function public.bump_image_regens(p_plan_id uuid)
returns int
language sql
security definer
set search_path = public
as $$
  update public.plans
     set image_regens = image_regens + 1
   where id = p_plan_id and user_id = auth.uid()
  returning image_regens;
$$;
revoke all on function public.bump_image_regens(uuid) from public, anon;
grant execute on function public.bump_image_regens(uuid) to authenticated;

-- ── 이용권 (결제 연동 없음, 관리자가 SQL 로 넣어요) ─────────────
-- single: remaining = 남은 건수 / monthly: period_start ~ period_end (한국 날짜). 본인 것만 읽고, 쓰기 정책은 두지 않아요.
create table if not exists public.entitlements (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('single','monthly')),
  remaining     int  check (remaining >= 0),
  period_start  date,
  period_end    date,
  created_at    timestamptz not null default now(),
  check (kind <> 'single'  or remaining is not null),
  check (kind <> 'monthly' or (period_start is not null and period_end is not null and period_start <= period_end))
);
create index if not exists entitlements_user_idx on public.entitlements(user_id);
alter table public.entitlements enable row level security;
drop policy if exists "본인 이용권 읽기" on public.entitlements;
create policy "본인 이용권 읽기" on public.entitlements for select to authenticated using (user_id = auth.uid());
revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;

-- ── 기획안 이미지 저장소 (비공개 버킷) ────────────────────────
-- 경로 {user_id}/{plan_id}/{version_no}-{n}.png. 본인 폴더만 읽고 쓰며, 화면은 서명 URL 로 보여 줘요.
insert into storage.buckets (id, name, public) values ('plan-images', 'plan-images', false) on conflict (id) do nothing;
drop policy if exists "기획안 이미지 본인 읽기" on storage.objects;
create policy "기획안 이미지 본인 읽기" on storage.objects for select to authenticated
  using (bucket_id = 'plan-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "기획안 이미지 본인 올리기" on storage.objects;
create policy "기획안 이미지 본인 올리기" on storage.objects for insert to authenticated
  with check (bucket_id = 'plan-images' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "기획안 이미지 본인 덮어쓰기" on storage.objects;
create policy "기획안 이미지 본인 덮어쓰기" on storage.objects for update to authenticated
  using (bucket_id = 'plan-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'plan-images' and (storage.foldername(name))[1] = auth.uid()::text);
