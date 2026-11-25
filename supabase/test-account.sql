-- 테스트 계정 (요금제와 상관없이 기획안 만들기·수정·이미지 다시 만들기를 계속 쓸 수 있는 계정)
-- Supabase → SQL Editor 에서 단계별로 실행해요.

-- ── 1단계 (한 번만): 이용권 종류에 'unlimited' 허용 ─────────────────────
alter table public.entitlements drop constraint if exists entitlements_kind_check;
alter table public.entitlements add constraint entitlements_kind_check
  check (kind in ('single', 'monthly', 'unlimited'));


-- ── 2단계: 테스트 계정에 무제한 이용권 넣기 ─────────────────────────────
-- 사이트에서 테스트 계정으로 먼저 회원가입(로그인)한 뒤, 아래 이메일을 그 계정 이메일로 바꿔 실행해요.
insert into public.entitlements (user_id, kind)
select u.id, 'unlimited'
from auth.users u
where u.email = '테스트계정@이메일.com'
  and not exists (select 1 from public.entitlements e where e.user_id = u.id and e.kind = 'unlimited');

-- 확인: 아래 결과에 테스트 계정 이메일과 unlimited 가 한 줄 보이면 성공이에요.
select u.email, e.kind, e.created_at
from public.entitlements e join auth.users u on u.id = e.user_id
where e.kind = 'unlimited';


-- ── (필요할 때) 테스트 계정 무제한 해제 ─────────────────────────────────
-- delete from public.entitlements
-- where kind = 'unlimited' and user_id = (select id from auth.users where email = '테스트계정@이메일.com');
