"use client";

import { useState } from "react";

type PlanId = "mensual" | "anual" | "founding";

const PLANES: {
  id: PlanId;
  nombre: string;
  precio: string;
  periodo: string;
  descripcion: string;
  destacado: boolean;
  badge: string | null;
}[] = [
  {
    id: "mensual",
    nombre: "Mensual",
    precio: "$3.490",
    periodo: "/mes",
    descripcion: "Boletas ilimitadas, reportes completos, historial.",
    destacado: false,
    badge: null,
  },
  {
    id: "anual",
    nombre: "Anual",
    precio: "$34.900",
    periodo: "/año",
    descripcion: "Todo lo de Mensual. Equivale a $2.908/mes — ahorras 2 meses.",
    destacado: true,
    badge: "Más popular",
  },
  {
    id: "founding",
    nombre: "Founding Member",
    precio: "$1.990",
    periodo: "/mes · vitalicio",
    descripcion: "Precio fijo para siempre. Acceso a todas las funciones futuras.",
    destacado: false,
    badge: "Precio bloqueado",
  },
];

export default function CheckoutButtons() {
  const [loading, setLoading] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(variant: PlanId) {
    setLoading(variant);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "Error al iniciar el pago. Intenta de nuevo.");
        return;
      }
      // Redirigir a la página de pago de Lemon Squeezy
      window.location.href = data.url;
    } catch {
      setError("Error de conexión. Revisa tu internet e intenta de nuevo.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 text-center">
          {error}
        </div>
      )}

      {PLANES.map((plan) => {
        const isLoading = loading === plan.id;
        const isDisabled = loading !== null;

        return (
          <div
            key={plan.id}
            className={`bg-white rounded-2xl border shadow-sm p-5 ${
              plan.destacado
                ? "border-emerald-400 ring-1 ring-emerald-400"
                : "border-gray-200"
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="font-bold text-gray-900">{plan.nombre}</p>
                <p className="text-xs text-gray-500 mt-0.5">{plan.descripcion}</p>
              </div>
              {plan.badge && (
                <span
                  className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    plan.destacado
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {plan.badge}
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-3xl font-bold text-gray-900">{plan.precio}</span>
              <span className="text-sm text-gray-500">{plan.periodo}</span>
            </div>

            <button
              onClick={() => handleCheckout(plan.id)}
              disabled={isDisabled}
              className={`w-full py-3 rounded-xl font-semibold transition-all ${
                isDisabled
                  ? "bg-emerald-600 text-white opacity-60 cursor-not-allowed"
                  : "bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95"
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Redirigiendo…
                </span>
              ) : (
                "Suscribirme"
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
