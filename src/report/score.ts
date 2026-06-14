import type { ResultadoOk } from "../engine/schema.js";
import type { HouseholdProfile } from "./schema.js";
import type { NivelRiesgo } from "./risk.js";

export type Tendencia = "mejorando" | "estable" | "empeorando" | "primera_boleta";

const UMBRAL_ESTABLE = 3; // diferencia de puntos considerada "estable"

export function calcScore(
  pctUltra: number,
  nivel: NivelRiesgo,
  profile: HouseholdProfile,
  motor: ResultadoOk
): number {
  let score = 100 - pctUltra;

  // Penalización: nivel alto con condiciones declaradas
  if (nivel === "alto" && profile.condiciones.length > 0) {
    score -= 5;
  }

  // Bonus: ≥2 productos NOVA 1 en el top-5 de gasto
  const top5 = [...motor.productos]
    .filter((p) => p.es_alimento)
    .sort((a, b) => b.precio * b.cantidad - a.precio * a.cantidad)
    .slice(0, 5);

  const nova1EnTop5 = top5.filter((p) => p.categoria_nova === 1).length;
  if (nova1EnTop5 >= 2) {
    score += 5;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

export function calcTendencia(
  scoreActual: number,
  ultimosScores: number[]
): Tendencia {
  if (ultimosScores.length === 0) return "primera_boleta";

  const recientes = ultimosScores.slice(-3);
  const promedio = recientes.reduce((s, v) => s + v, 0) / recientes.length;
  const diff = scoreActual - promedio;

  if (diff > UMBRAL_ESTABLE) return "mejorando";
  if (diff < -UMBRAL_ESTABLE) return "empeorando";
  return "estable";
}
