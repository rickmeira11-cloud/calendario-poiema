-- Migração: banner_permanent — Mural Poiema BNU — 2026-11-17
-- Rodar no SQL Editor do Supabase após supabase-banners.sql já ter sido executado.

-- Coluna que marca banners sem data de expiração (recorrentes / institucionais).
-- month=0 / day=0 são usados como sentinela para essas entradas;
-- não aparecem no grid do mural, apenas no carrossel.
alter table public.mural_events
  add column if not exists banner_permanent boolean default false;

-- Verificação pós-execução:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'mural_events' AND column_name = 'banner_permanent';
-- → deve retornar 1 linha
