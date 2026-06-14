-- Permisos explícitos para el rol authenticated en todas las tablas.
-- Requerido desde Supabase CLI >= 2.x (auto_expose_new_tables deshabilitado por defecto).

grant usage on schema public to authenticated;

grant select, insert, update on table public.users         to authenticated;
grant select, insert         on table public.receipts      to authenticated;
grant select, insert         on table public.reports       to authenticated;
grant select, insert         on table public.score_history to authenticated;
