import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ReportSchema } from "@/lib/report/schema";
import type { Report } from "@/lib/report/schema";

// ── Formato ──────────────────────────────────────────────────────────────────

function clp(n: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);
}

function scoreColor(score: number) {
  if (score >= 70) return "#10b981";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

const NIVEL_LABEL = { bajo: "Riesgo bajo", moderado: "Riesgo moderado", alto: "Riesgo alto" } as const;
const NIVEL_CLS = {
  bajo: "bg-emerald-100 text-emerald-800",
  moderado: "bg-amber-100 text-amber-800",
  alto: "bg-red-100 text-red-800",
} as const;
const PBAR_CLS = { bajo: "bg-emerald-400", moderado: "bg-amber-400", alto: "bg-red-400" } as const;
const TIPO_CLS = {
  salud: "bg-emerald-100 text-emerald-700",
  dinero: "bg-sky-100 text-sky-700",
  equilibrio: "bg-violet-100 text-violet-700",
} as const;
const TENDENCIA_LABEL = {
  mejorando: "↑ Mejorando",
  empeorando: "↓ Empeorando",
  estable: "→ Estable",
  primera_boleta: "★ Primera boleta",
} as const;

// ── Sub-componentes ───────────────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm p-5 ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ icon, label, sub }: { icon: string; label: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
        <span aria-hidden>{icon}</span>
        {label}
      </h2>
      {sub && <p className="text-xs text-gray-400 mt-0.5 ml-6">{sub}</p>}
    </div>
  );
}

function ProgressBar({ pct, cls }: { pct: number; cls: string }) {
  return (
    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemax={100}>
      <div className={`h-full rounded-full ${cls}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = scoreColor(score);
  return (
    <svg viewBox="0 0 88 88" className="w-24 h-24 shrink-0" aria-label={`Score ${score} de 100`} role="img">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#f3f4f6" strokeWidth="9" />
      <circle
        cx="44" cy="44" r={r} fill="none"
        stroke={color} strokeWidth="9"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 44 44)"
      />
      <text x="44" y="44" dominantBaseline="middle" textAnchor="middle"
        fontSize="20" fontWeight="bold" fill={color}>{score}</text>
    </svg>
  );
}

// ── Secciones ─────────────────────────────────────────────────────────────────

// ── Página principal ──────────────────────────────────────────────────────────

export default async function ReportePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("reports")
    .select("report_json, created_at")
    .eq("id", id)
    .single();

  if (!row) notFound();

  const parsed = ReportSchema.safeParse(row.report_json);
  if (!parsed.success) notFound();

  const r = parsed.data;
  const c1 = r.capa1_espejoFinanciero;
  const c2 = r.capa2_riesgoSalud;
  const c3 = r.capa3_costoEnSudor;
  const c4 = r.capa4_planCorreccion;
  const m = r.marcador;

  return (
    <div className="space-y-4 pb-10">

      {/* ── Hero: score + tendencia ───────────────────────────────── */}
      <Card className="flex items-center gap-5">
        <ScoreRing score={m.score} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 mb-1">
            {new Date(r.fecha).toLocaleDateString("es-CL", {
              day: "numeric", month: "long", year: "numeric",
            })}
          </p>
          <p className="text-sm font-semibold text-gray-700">
            {TENDENCIA_LABEL[m.tendencia]}
          </p>
          <p className="text-xs text-gray-400 mt-1">Score de alimentación</p>
          {m.ahorroAcumuladoCLP > 0 && (
            <p className="text-xs text-emerald-600 mt-1 font-medium">
              Ahorro acumulado: {clp(m.ahorroAcumuladoCLP)}
            </p>
          )}
        </div>
      </Card>

      {/* ── Capa 1: Espejo Financiero ─────────────────────────────── */}
      <Card>
        <SectionTitle icon="💰" label="Espejo Financiero" sub="Cómo gastaste en esta boleta" />
        <dl className="space-y-3">
          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Total boleta</dt>
            <dd className="font-semibold">{clp(c1.totalBoleta)}</dd>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1.5">
              <dt className="text-gray-500">Ultraprocesados (NOVA 4)</dt>
              <dd className="font-semibold">{c1.pctUltraprocesados.toFixed(1)}%</dd>
            </div>
            <ProgressBar pct={c1.pctUltraprocesados} cls={PBAR_CLS[c2.nivel]} />
          </div>

          <div className="flex justify-between text-sm">
            <dt className="text-gray-500">Gasto en ultra</dt>
            <dd className="font-semibold text-red-600">{clp(c1.totalUltraprocesados)}</dd>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between text-sm">
              <dt className="text-gray-500">Proyección anual</dt>
              <dd className="font-medium">{clp(c1.proyeccionAnualUltra)}</dd>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Asumiendo {c1.frecuenciaAsumida} boletas/mes
            </p>
          </div>
        </dl>
      </Card>

      {/* ── Capa 2: Riesgo de Salud ──────────────────────────────── */}
      <Card>
        <SectionTitle icon="🩺" label="Riesgo de Salud" />

        <div className="mb-4">
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${NIVEL_CLS[c2.nivel]}`}>
            {NIVEL_LABEL[c2.nivel]}
          </span>
        </div>

        {c2.factores.length > 0 && (
          <ul className="text-xs text-gray-500 space-y-1 mb-4">
            {c2.factores.map((f, i) => (
              <li key={i} className="flex gap-1.5">
                <span aria-hidden>•</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}

        <blockquote className="border-l-4 border-emerald-300 pl-4 text-sm text-gray-700 leading-relaxed">
          {c2.narrativa}
        </blockquote>

        <p className="text-xs text-gray-400 mt-3 leading-relaxed">{c2.disclaimer}</p>
      </Card>

      {/* ── Capa 3: Costo en Sudor ───────────────────────────────── */}
      <Card>
        <SectionTitle
          icon="🏃"
          label="Costo en Sudor"
          sub={`${c3.caloriasUltra.toLocaleString("es-CL")} kcal en ultraprocesados`}
        />
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { emoji: "🚶", value: c3.equivalencias.caminataHoras, label: "h caminata" },
            { emoji: "🏃", value: c3.equivalencias.troteHoras, label: "h trote" },
            { emoji: "💪", value: c3.equivalencias.gimnasioSesiones, label: "sesiones gym" },
          ].map(({ emoji, value, label }) => (
            <div key={label} className="bg-gray-50 rounded-xl p-3">
              <div className="text-2xl mb-1" aria-hidden>{emoji}</div>
              <div className="text-lg font-bold text-gray-800">{value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        {c3.caloriasTotales > 0 && (
          <p className="text-xs text-gray-400 mt-3 text-center">
            Calorías totales en boleta: {c3.caloriasTotales.toLocaleString("es-CL")} kcal
          </p>
        )}
      </Card>

      {/* ── Capa 4: Plan de Corrección ───────────────────────────── */}
      <Card>
        <SectionTitle icon="🔄" label="Tu plan de mejora" sub="3 cambios concretos para esta semana" />
        <div className="space-y-3">
          {c4.swaps.map((s, i) => (
            <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 line-through truncate">{s.producto}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5">{s.alternativa}</p>
                </div>
                <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${TIPO_CLS[s.tipo]}`}>
                  {s.tipo}
                </span>
              </div>

              <p className="text-xs text-gray-500">{s.diferenciaNutricional}</p>

              <div className="flex items-center justify-between pt-1">
                {s.ahorroCLPMes > 0 ? (
                  <span className="text-xs font-medium text-emerald-700">
                    Ahorra {clp(s.ahorroCLPMes)}/mes
                  </span>
                ) : s.ahorroCLPMes < 0 ? (
                  <span className="text-xs text-gray-400">
                    {clp(Math.abs(s.ahorroCLPMes))}/mes más (vale por salud)
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Mismo precio</span>
                )}
                <span className="text-xs text-gray-400 text-right max-w-[120px] truncate">
                  {s.disponibleEn.join(" · ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <div className="space-y-3 pt-2">
        <Link
          href="/subir"
          className="block w-full py-3.5 rounded-2xl bg-emerald-600 text-white font-semibold text-center hover:bg-emerald-700 transition-colors shadow-sm"
        >
          📄 Analizar otra boleta
        </Link>
        <Link
          href="/dashboard"
          className="block w-full py-3 rounded-2xl border border-gray-200 text-gray-600 font-medium text-center hover:bg-gray-50 transition-colors text-sm"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
