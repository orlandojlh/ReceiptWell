-- Tabla de auditoría de suscripciones de Lemon Squeezy.
-- La fuente de verdad del plan activo sigue siendo users.plan / users.plan_expires_at.
-- Esta tabla registra el historial completo de eventos de suscripción.

create table if not exists public.subscriptions (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users(id) on delete cascade,
  ls_subscription_id  text        unique not null,
  ls_variant_id       text        not null,
  plan                text        not null check (plan in ('premium', 'founding')),
  status              text        not null,
  renews_at           timestamptz,
  ends_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- El usuario puede leer su propia suscripción (ej: para mostrar "tu plan expira el...")
create policy "users_read_own_subscription" on public.subscriptions
  for select
  using (auth.uid() = user_id);

-- Solo service_role puede escribir (el webhook usa service client)
grant select, insert, update, delete on public.subscriptions to service_role;
