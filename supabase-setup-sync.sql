-- ============================================================
-- Mural Poiema BNU — sincronização com a planilha (com aprovação)
-- Rode este script no SQL Editor do Supabase, DEPOIS de já ter
-- rodado o supabase-setup-mural.sql original.
-- ============================================================

-- Marca a origem de cada evento: 'manual' (criado direto no mural)
-- ou 'sheet' (veio da planilha). Isso garante que o sincronizador
-- NUNCA proponha remover algo que vocês criaram manualmente no mural.
alter table public.mural_events
  add column if not exists source text not null default 'manual';

-- Rode esta linha UMA VEZ para marcar os eventos que vieram
-- originalmente da planilha (os que já estavam lá no "carregar dados originais").
-- Se preferir não rodar, está tudo bem — o sync só vai considerar como
-- "vindo da planilha" os eventos aprovados a partir de agora.
update public.mural_events set source = 'sheet';

-- Tabela de propostas de mudança, aguardando aprovação
create table if not exists public.mural_pending_changes (
  id uuid primary key default gen_random_uuid(),
  month int not null,
  day int not null,
  change_type text not null check (change_type in ('add','remove')),
  new_text text,
  new_category text,
  new_hour text,
  old_text text,
  old_category text,
  old_hour text,
  matched_event_id uuid references public.mural_events(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  detected_at timestamptz default now()
);

alter table public.mural_pending_changes enable row level security;

drop policy if exists "Public read changes" on public.mural_pending_changes;
create policy "Public read changes" on public.mural_pending_changes
  for select using (true);

drop policy if exists "Public insert changes" on public.mural_pending_changes;
create policy "Public insert changes" on public.mural_pending_changes
  for insert with check (true);

drop policy if exists "Public update changes" on public.mural_pending_changes;
create policy "Public update changes" on public.mural_pending_changes
  for update using (true);

drop policy if exists "Public delete changes" on public.mural_pending_changes;
create policy "Public delete changes" on public.mural_pending_changes
  for delete using (true);

alter publication supabase_realtime add table public.mural_pending_changes;

create index if not exists idx_pending_status on public.mural_pending_changes (status);
