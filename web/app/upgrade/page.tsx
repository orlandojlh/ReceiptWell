import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import CheckoutButtons from "./CheckoutButtons";

export default async function UpgradePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/upgrade");

  return (
    <div className="space-y-6 pb-10">

      {/* Header */}
      <div className="text-center pt-2">
        <h1 className="text-2xl font-bold text-gray-900">Elige tu plan</h1>
        <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto">
          El plan gratuito incluye 2 boletas por mes. Con Premium, analiza todas las que quieras.
        </p>
      </div>

      {/* Checkout buttons — client component */}
      <CheckoutButtons />

      {/* Gratis disclaimer */}
      <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 text-center">
        <p className="text-sm font-medium text-gray-700">Plan gratuito incluye</p>
        <p className="text-xs text-gray-500 mt-1">
          2 boletas con IA por mes · Reporte de 4 capas · Sin tarjeta de crédito
        </p>
      </div>

      {/* Back */}
      <Link
        href="/dashboard"
        className="block w-full py-3 rounded-2xl border border-gray-200 text-gray-600 font-medium text-center hover:bg-gray-50 transition-colors text-sm"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
