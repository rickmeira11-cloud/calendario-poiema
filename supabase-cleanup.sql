-- Auditoria Mural Poiema BNU — 2026-11-08
-- Rodar no SQL Editor do Supabase (projeto vsfuuxbriozoowcnahak).
-- Fazer backup (.json pelo mural) antes de executar.

-- 2.1 — Limpar histórico processado (approved/rejected)
-- Essas linhas ficam acumulando; o mural_activity_log já guarda o rastro das aprovações.
delete from mural_pending_changes where status in ('approved', 'rejected');

-- 2.2 — Remover políticas RLS duplicadas em mural_pending_changes
-- Mantém o conjunto "Public * pending"; dropa o conjunto "Public * changes".
drop policy if exists "Public read changes"   on public.mural_pending_changes;
drop policy if exists "Public insert changes" on public.mural_pending_changes;
drop policy if exists "Public update changes" on public.mural_pending_changes;
drop policy if exists "Public delete changes" on public.mural_pending_changes;

-- 2.3 — Remover índice duplicado em mural_pending_changes
-- Mantém idx_mural_pending_status (nome do script oficial).
drop index if exists idx_pending_status;

-- 2.4 — Índice de cobertura para a FK matched_event_id
create index if not exists idx_mural_pending_matched_event
  on public.mural_pending_changes (matched_event_id);

-- Verificação pós-execução:
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename = 'mural_pending_changes';
-- SELECT indexname FROM pg_indexes WHERE tablename = 'mural_pending_changes';
-- SELECT count(*) FROM mural_pending_changes;
