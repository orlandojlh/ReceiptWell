import * as crypto from "crypto";
import type { ResultadoOk } from "../engine/schema.js";
import { ReportSchema, type Report, type HouseholdProfile } from "./schema.js";
import { calcCapa1, calcCapa3 } from "./calc.js";
import { calcRiesgo } from "./risk.js";
import { calcScore, calcTendencia } from "./score.js";
import { runGuard, DISCLAIMER } from "./guard.js";
import {
  type HistoryStore,
  createLocalHistoryStore,
  createSupabaseHistoryStore,
} from "./history.js";

/**
 * Construye el reporte de 4 capas.
 *
 * @param historyOrUserId
 *   - HistoryStore  → se usa directamente (modo local o inyectado en tests)
 *   - string        → se interpreta como userId y se crea un SupabaseHistoryStore
 *   - undefined     → modo local (createLocalHistoryStore)
 */
export async function buildReport(
  motor: ResultadoOk,
  profile: HouseholdProfile,
  historyOrUserId?: HistoryStore | string
): Promise<Report> {
  // ── Resolver el HistoryStore ─────────────────────────────────────────────
  let history: HistoryStore;
  if (typeof historyOrUserId === "string") {
    history = await createSupabaseHistoryStore(historyOrUserId);
  } else if (historyOrUserId !== undefined) {
    history = historyOrUserId;
  } else {
    history = createLocalHistoryStore();
  }

  // ── Capas 1 y 3: puro TypeScript, sin IA ────────────────────────────────
  const capa1 = calcCapa1(motor);
  const capa3 = calcCapa3(motor);

  // ── Capa 2 nivel + factores: reglas determinísticas ──────────────────────
  const { nivel, factores } = calcRiesgo(capa1.pctUltraprocesados, profile);

  // ── Capas 2 narrativa + capa 4 swaps: IA con guardián ───────────────────
  const guard = await runGuard(motor, profile, nivel, capa1.pctUltraprocesados);

  // ── Marcador: score + tendencia + ahorro acumulado ───────────────────────
  const historialReciente = await history.recent(3);
  const ultimosScores = historialReciente.map((e) => e.score);
  const score = calcScore(capa1.pctUltraprocesados, nivel, profile, motor);
  const tendencia = calcTendencia(score, ultimosScores);
  const ahorroAcumuladoCLP = await history.totalAhorro();

  // ── Persistir entrada en historial ──────────────────────────────────────
  await history.append({
    fecha: new Date().toISOString(),
    score,
    ahorroAceptadoCLP: 0, // el usuario acepta swaps en el frontend (S4+)
  });

  // ── Construir y validar el reporte con Zod ───────────────────────────────
  const raw = {
    version: "report-v1" as const,
    boletaId: crypto.randomUUID(),
    fecha: new Date().toISOString(),
    capa1_espejoFinanciero: capa1,
    capa2_riesgoSalud: {
      nivel,
      factores,
      narrativa: guard.narrativa,
      disclaimer: DISCLAIMER,
    },
    capa3_costoEnSudor: capa3,
    capa4_planCorreccion: {
      swaps: guard.swaps,
    },
    marcador: {
      ahorroAcumuladoCLP,
      score,
      tendencia,
    },
  };

  return ReportSchema.parse(raw);
}
