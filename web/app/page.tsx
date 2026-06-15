export const dynamic = 'force-dynamic';

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import t from "@/lib/i18n/es-CL";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-emerald-600">{t.app.name}</h1>
        <p className="mt-2 text-gray-500">{t.app.tagline}</p>
      </div>

      <div className="flex flex-col gap-3 w-full">
        <Link
          href="/registro"
          className="py-3 rounded-xl bg-emerald-600 text-white font-semibold text-base hover:bg-emerald-700 transition-colors"
        >
          {t.auth.register}
        </Link>
        <Link
          href="/login"
          className="py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-base hover:bg-gray-50 transition-colors"
        >
          {t.auth.login}
        </Link>
      </div>
    </div>
  );
}
