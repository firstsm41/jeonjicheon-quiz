-- ─────────────────────────────────────────────────────────────
--  이미 schema.sql 을 실행한 프로젝트에 뒤늦게 추가된 기능을
--  붙이는 마이그레이션 SQL. Supabase → SQL Editor 에 붙여넣고 Run 하세요.
--  (여러 번 실행해도 안전합니다)
-- ─────────────────────────────────────────────────────────────

-- 주관식(Q6) 답안을 담을 컬럼
alter table public.responses
  add column if not exists open_answers jsonb not null default '{}'::jsonb;

-- ── 진행자 설정 테이블 ────────────────────────────────────────

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

alter publication supabase_realtime add table public.settings;
