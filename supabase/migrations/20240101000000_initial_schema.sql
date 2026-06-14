-- ============================================================
-- ReceiptWell S4 — Migración inicial
-- ============================================================

-- ── Tabla: users ─────────────────────────────────────────────
create table users (
  id uuid primary key default auth.uid(),
  email text unique not null,
  nombre text default '',
  objetivo text check (objetivo in ('ahorrar', 'salud', 'equilibrio')) default 'equilibrio',
  adultos integer default 1,
  ninos integer default 0,
  condiciones text[] default array[]::text[],
  created_at timestamp default now(),
  updated_at timestamp default now()
);

alter table users enable row level security;

create policy "users_own_profile" on users
  for select
  using (auth.uid() = id);

create policy "users_update_own_profile" on users
  for update
  using (auth.uid() = id);

-- ── Tabla: receipts ──────────────────────────────────────────
create table receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  imagen_path text,
  motor_json jsonb,
  created_at timestamp default now()
);

alter table receipts enable row level security;

create policy "users_own_receipts" on receipts
  for select
  using (auth.uid() = user_id);

-- ── Tabla: reports ───────────────────────────────────────────
create table reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  receipt_id uuid references receipts(id) on delete cascade,
  report_json jsonb,
  created_at timestamp default now()
);

alter table reports enable row level security;

create policy "users_own_reports" on reports
  for select
  using (auth.uid() = user_id);

-- ── Tabla: score_history ─────────────────────────────────────
create table score_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  fecha timestamp,
  score integer check (score >= 0 and score <= 100),
  ahorro_aceptado_clp integer default 0,
  created_at timestamp default now()
);

alter table score_history enable row level security;

create policy "users_own_history" on score_history
  for select
  using (auth.uid() = user_id);

create policy "users_append_own_history" on score_history
  for insert
  with check (auth.uid() = user_id);

-- ── Storage bucket: receipts ─────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('receipts', 'receipts', false);

create policy "users_upload_receipts" on storage.objects
  for insert
  with check (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "users_read_own_receipts" on storage.objects
  for select
  using (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
