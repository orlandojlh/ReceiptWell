-- Columnas de plan freemium en users.
-- plan: "free" (default) | "premium" | "founding"
-- plan_expires_at: solo relevante para "premium" con pago mensual/anual;
--   NULL = sin expiración (founding es vitalicio).

alter table public.users
  add column if not exists plan text not null default 'free'
    check (plan in ('free', 'premium', 'founding')),
  add column if not exists plan_expires_at timestamptz;
