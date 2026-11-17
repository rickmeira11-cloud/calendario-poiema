-- Migração: carrossel de banners — Mural Poiema BNU — 2026-11-17
-- Rodar no SQL Editor do Supabase (projeto vsfuuxbriozoowcnahak).
-- Faça backup (.json pelo mural) ANTES de rodar.

-- 1. Bucket de Storage para artes dos eventos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-banners',
  'event-banners',
  true,
  3145728,                                    -- 3 MB por arquivo
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

-- 2. Policies do bucket (coerentes com o RLS aberto do mural — sem login)

-- Leitura pública: qualquer pessoa pode ver as imagens no mural
drop policy if exists "Public read banners" on storage.objects;
create policy "Public read banners" on storage.objects
  for select using (bucket_id = 'event-banners');

-- Upload público: qualquer visitante pode subir banner (ver nota de segurança no código)
drop policy if exists "Public upload banners" on storage.objects;
create policy "Public upload banners" on storage.objects
  for insert with check (bucket_id = 'event-banners');

-- Remoção pública: necessária para trocar/limpar banners pelo mural
drop policy if exists "Public delete banners" on storage.objects;
create policy "Public delete banners" on storage.objects
  for delete using (bucket_id = 'event-banners');

-- 3. Coluna banner_url em mural_events
--    null = sem banner; valor = URL pública do arquivo no bucket OU link externo colado
alter table public.mural_events
  add column if not exists banner_url text;

-- Verificação pós-execução:
-- SELECT id FROM storage.buckets WHERE id = 'event-banners';
-- → deve retornar 1 linha
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'mural_events' AND column_name = 'banner_url';
-- → deve retornar 1 linha
