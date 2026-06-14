import { createClient } from "@supabase/supabase-js";

// Cliente con service_role: bypasea RLS para operaciones server-side.
// NUNCA exponer al navegador — solo usar en API routes y Server Actions.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!serviceKey) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
