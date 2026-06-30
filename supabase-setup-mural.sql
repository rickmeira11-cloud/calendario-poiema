-- ============================================================
-- Mural Poiema BNU — setup do Supabase
-- Rode este script inteiro no SQL Editor do seu projeto Supabase
-- (Dashboard → SQL Editor → New query → cole tudo → Run)
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.mural_events (
  id uuid primary key default gen_random_uuid(),
  month int not null check (month between 1 and 12),
  day int not null check (day between 1 and 31),
  text text not null,
  category text not null default 'culto',
  hour text default '',
  created_at timestamptz default now()
);

-- Habilita Row Level Security
alter table public.mural_events enable row level security;

-- Políticas abertas (qualquer pessoa com a anon key consegue ler/escrever).
-- Isso é adequado para um link interno de equipe, mas lembre-se:
-- quem tiver a URL + anon key do projeto consegue editar os dados desta tabela.
-- Se quiser mais segurança no futuro, troque "using (true)" por uma checagem
-- de usuário autenticado via Supabase Auth.
drop policy if exists "Public read" on public.mural_events;
create policy "Public read" on public.mural_events
  for select using (true);

drop policy if exists "Public insert" on public.mural_events;
create policy "Public insert" on public.mural_events
  for insert with check (true);

drop policy if exists "Public update" on public.mural_events;
create policy "Public update" on public.mural_events
  for update using (true);

drop policy if exists "Public delete" on public.mural_events;
create policy "Public delete" on public.mural_events
  for delete using (true);

-- Habilita Realtime (para as edições aparecerem ao vivo para todos os usuários)
alter publication supabase_realtime add table public.mural_events;

-- Índice para consultas mais rápidas por mês/dia
create index if not exists idx_mural_events_month_day on public.mural_events (month, day);
