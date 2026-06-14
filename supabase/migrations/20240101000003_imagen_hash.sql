-- ============================================================
-- S5 Fase 2 — anti-abuso: imagen_hash + procesado_ia
-- ============================================================

-- imagen_hash: SHA-256 hex del archivo original, para deduplicar sin gastar IA
-- procesado_ia: true cuando efectivamente se llamó a Gemini, para el rate limit real
alter table receipts
  add column if not exists imagen_hash text,
  add column if not exists procesado_ia boolean not null default false;

-- Índice compuesto para la búsqueda de duplicados: O(log n) por usuario
create index if not exists idx_receipts_user_hash
  on receipts (user_id, imagen_hash)
  where imagen_hash is not null;

-- Índice para el rate limit (contar llamadas a IA por usuario en última hora)
create index if not exists idx_receipts_user_created
  on receipts (user_id, created_at);

-- Políticas de inserción — solo si no existen ya de una migración previa
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'receipts' and policyname = 'users_insert_own_receipts'
  ) then
    execute 'create policy "users_insert_own_receipts" on receipts
      for insert with check (auth.uid() = user_id)';
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'reports' and policyname = 'users_insert_own_reports'
  ) then
    execute 'create policy "users_insert_own_reports" on reports
      for insert with check (auth.uid() = user_id)';
  end if;
end $$;
