-- Permisos explícitos para service_role.
-- Necesario desde Supabase CLI >= 2.x (auto_expose_new_tables deshabilitado).
-- service_role bypassea RLS pero igual requiere GRANT a nivel de tabla.

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.users         to service_role;
grant select, insert, update, delete on table public.receipts      to service_role;
grant select, insert, update, delete on table public.reports       to service_role;
grant select, insert, update, delete on table public.score_history to service_role;
