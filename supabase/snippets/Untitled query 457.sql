-- 1. Insertar usuario faltante y activar premium
INSERT INTO public.users (id, email, plan, plan_expires_at, created_at, updated_at)
VALUES (
  '9517ce9b-3880-47f7-bcf3-51f5dd2e9796',
  'ojlh@hotmail.com',
  'premium',
  (now() + interval '1 month'),
  now(),
  now()
)
ON CONFLICT (id) DO UPDATE SET
  plan = 'premium',
  plan_expires_at = (now() + interval '1 month'),
  updated_at = now();

-- 2. Crear trigger para futuros registros
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, plan, created_at, updated_at)
  VALUES (NEW.id, NEW.email, 'free', now(), now())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();