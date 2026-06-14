import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";
import t from "@/lib/i18n/es-CL";

const FREE_MONTHLY_LIMIT = 2;

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Leer plan y conteo del mes para el badge freemium
  const svc = createServiceClient();
  const { data: userRow } = await svc
    .from("users")
    .select("plan, plan_expires_at")
    .eq("id", user.id)
    .single();

  const plan = userRow?.plan ?? "free";
  const esPremium =
    (plan === "premium" &&
      (!userRow?.plan_expires_at ||
        new Date(userRow.plan_expires_at) > new Date())) ||
    plan === "founding";

  let analisisMes = 0;
  if (!esPremium) {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const { count } = await svc
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("procesado_ia", true)
      .gte("created_at", inicioMes.toISOString());
    analisisMes = count ?? 0;
  }

  const limiteAlcanzado = !esPremium && analisisMes >= FREE_MONTHLY_LIMIT;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h1 className="text-xl font-bold mb-1">¡Hola!</h1>
        <p className="text-sm text-gray-500">{user.email}</p>
        {esPremium && (
          <span className="inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
            ✦ Premium activo
          </span>
        )}
      </div>

      {/* Badge freemium — solo para plan free */}
      {!esPremium && (
        <div
          className={`rounded-2xl border p-4 flex items-center justify-between gap-3 ${
            limiteAlcanzado
              ? "bg-amber-50 border-amber-200"
              : "bg-gray-50 border-gray-200"
          }`}
        >
          <div>
            <p
              className={`text-sm font-semibold ${
                limiteAlcanzado ? "text-amber-800" : "text-gray-700"
              }`}
            >
              {analisisMes} de {FREE_MONTHLY_LIMIT} boletas gratis este mes
            </p>
            {limiteAlcanzado && (
              <p className="text-xs text-amber-600 mt-0.5">
                Mejora tu plan para seguir analizando
              </p>
            )}
          </div>
          {limiteAlcanzado ? (
            <Link
              href="/upgrade"
              className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors"
            >
              Ver planes
            </Link>
          ) : (
            <span className="shrink-0 text-xs text-gray-400">
              Plan gratuito
            </span>
          )}
        </div>
      )}

      <Link
        href="/subir"
        className="block w-full py-4 rounded-2xl bg-emerald-600 text-white font-semibold text-center text-lg hover:bg-emerald-700 transition-colors shadow-sm"
      >
        📄 {t.nav.upload}
      </Link>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <p className="text-sm text-gray-400 text-center">
          Tus reportes aparecerán aquí.
        </p>
      </div>
    </div>
  );
}
