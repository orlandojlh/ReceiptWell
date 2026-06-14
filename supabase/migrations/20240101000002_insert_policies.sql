-- INSERT policies que faltan en la migración inicial.
-- receipts y reports referencian auth.users(id), por lo que no requieren
-- que exista un perfil en public.users para insertar.

create policy "users_insert_own_profile" on public.users
  for insert
  with check (auth.uid() = id);

create policy "users_insert_own_receipts" on public.receipts
  for insert
  with check (auth.uid() = user_id);

create policy "users_insert_own_reports" on public.reports
  for insert
  with check (auth.uid() = user_id);
