import type { ResultadoOk } from "../engine/schema";
import type { HouseholdProfile } from "./schema";
import type { NivelRiesgo } from "./risk";

export type Tendencia = "mejorando" | "estable" | "empeorando" | "primera_boleta";

const UMBRAL_ESTABLE = 3;

export function calcScore(
  _pctUltra: number,
  _nivel: NivelRiesgo,
  _profile: HouseholdProfile,
  motor: ResultadoOk
): number {
  const totalAlimentos = motor.totales.total_alimentos;

  if (totalAlimentos === 0) return 50;

  const totalNova4 = motor.totales.total_nova4;
  const totalNova3 = motor.productos
    .filter((p) => p.es_alimento && p.categoria_nova === 3)
    .reduce((sum, p) => sum + p.precio * p.cantidad, 0);

  const gastoFrutasVerduras = motor.productos
    .filter((p) => p.es_alimento && (p.categoria === "frutas" || p.categoria === "verduras"))
    .reduce((sum, p) => sum + p.precio * p.cantidad, 0);

  const gastoProteinaAnimal = motor.productos
    .filter((p) => p.es_alimento && (
      p.categoria === "carnes" || p.categoria === "lacteos" || p.categoria === "embutidos"
    ))
    .reduce((sum, p) => sum + p.precio * p.cantidad, 0);

  const pctNova4 = (totalNova4 / totalAlimentos) * 100;
  const pctNova3 = (totalNova3 / totalAlimentos) * 100;
  const pctFrutasVerduras = (gastoFrutasVerduras / totalAlimentos) * 100;
  const pctProteinaAnimal = (gastoProteinaAnimal / totalAlimentos) * 100;

  // Penalización NOVA 4 — castigo fuerte (factor 1.3)
  const penalizacionNova4 = Math.round(pctNova4 * 1.3);

  // Penalización NOVA 3 — castigo moderado (factor 0.4)
  const penalizacionNova3 = Math.round(pctNova3 * 0.4);

  // Penalización desbalance — proteína animal alta sin contrapeso vegetal
  let penalizacionDesbalance = 0;
  if (pctProteinaAnimal > 65 && pctFrutasVerduras < 20) {
    penalizacionDesbalance = 15;
  } else if (pctProteinaAnimal > 55 && pctFrutasVerduras < 15) {
    penalizacionDesbalance = 10;
  }

  // Bonus frutas y verduras
  let bonusFrutasVerduras = 0;
  if (pctFrutasVerduras >= 35) {
    bonusFrutasVerduras = 10;
  } else if (pctFrutasVerduras >= 20) {
    bonusFrutasVerduras = 5;
  } else if (pctFrutasVerduras >= 10) {
    bonusFrutasVerduras = 2;
  }

  const puntaje = Math.max(
    0,
    Math.min(
      100,
      100 - penalizacionNova4 - penalizacionNova3 - penalizacionDesbalance + bonusFrutasVerduras
    )
  );

  return Math.round(puntaje);
}

export function scoreInterpretacion(puntaje: number): string {
  if (puntaje >= 85) return "Excelente equilibrio nutricional";
  if (puntaje >= 70) return "Buen equilibrio con pequeños ajustes posibles";
  if (puntaje >= 55) return "Equilibrio aceptable con puntos claros a mejorar";
  if (puntaje >= 40) return "Hay espacio importante de mejora";
  return "Esta boleta tiene un perfil de alto procesamiento";
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
