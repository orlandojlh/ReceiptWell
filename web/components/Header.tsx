"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import t from "@/lib/i18n/es-CL";

export default function Header() {
  const [user, setUser] = useState<User | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_, session) =>
      setUser(session?.user ?? null)
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
        <Link href={user ? "/dashboard" : "/"} className="font-bold text-lg tracking-tight text-emerald-600">
          {t.app.name}
        </Link>

        {user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 truncate max-w-[140px]">
              {user.email}
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              {t.auth.logOut}
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
          >
            {t.auth.login}
          </Link>
        )}
      </div>
    </header>
  );
}
