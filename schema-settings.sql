-- ─────────────────────────────────────────────────────────────
--  이미 schema.sql 을 실행한 프로젝트에 '진행자 설정' 기능만 추가하는 SQL
--  Supabase → SQL Editor 에 붙여넣고 Run 하세요. (한 번만)
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

alter publication supabase_realtime add table public.settings;
