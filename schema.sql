-- ─────────────────────────────────────────────────────────────
--  Supabase SQL Editor 에 그대로 붙여넣고 실행하세요.
-- ─────────────────────────────────────────────────────────────

-- answers 는 문항 순서대로의 선택지 번호(0부터). 무응답은 -1 로 저장됩니다.
-- 점수는 저장하지 않습니다 — 개인 점수가 아니라 문항별 응답 분포만 사용합니다.
create table if not exists public.responses (
  id         uuid primary key default gen_random_uuid(),
  session    text        not null default 'default',
  answers    smallint[]  not null,
  created_at timestamptz not null default now()
);

create index if not exists responses_session_idx on public.responses (session);

-- Row Level Security: 익명 사용자에게 딱 필요한 권한만 부여
alter table public.responses enable row level security;

drop policy if exists "anyone can read" on public.responses;
create policy "anyone can read"
  on public.responses for select
  to anon, authenticated
  using (true);

drop policy if exists "anyone can insert" on public.responses;
create policy "anyone can insert"
  on public.responses for insert
  to anon, authenticated
  with check (true);

-- 같은 기기에서 다시 풀었을 때 기존 기록을 갱신하기 위한 정책.
-- (익명 사용자이므로 update 는 허용하되 delete 는 막습니다)
drop policy if exists "anyone can update" on public.responses;
create policy "anyone can update"
  on public.responses for update
  to anon, authenticated
  using (true)
  with check (true);

-- ─────────────────────────────────────────────────────────────
--  진행자 설정 (회차별 1행)
--  show_results 가 true 일 때만 참여자에게 '결과 보기'가 노출됩니다.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.settings (
  session      text primary key,
  show_results boolean     not null default false,
  updated_at   timestamptz not null default now()
);

alter table public.settings enable row level security;

drop policy if exists "settings read" on public.settings;
create policy "settings read"
  on public.settings for select
  to anon, authenticated
  using (true);

drop policy if exists "settings write" on public.settings;
create policy "settings write"
  on public.settings for insert
  to anon, authenticated
  with check (true);

drop policy if exists "settings update" on public.settings;
create policy "settings update"
  on public.settings for update
  to anon, authenticated
  using (true)
  with check (true);

-- 실시간 구독 활성화
alter publication supabase_realtime add table public.responses;
alter publication supabase_realtime add table public.settings;
