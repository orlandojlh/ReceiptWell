import * as crypto from "crypto";
import type { ResultadoOk } from "../engine/schema";
import { ReportSchema, type Report, type HouseholdProfile } from "./schema";
import { calcCapa1, calcCapa3 } from "./calc";
import { calcRiesgo } from "./risk";
import { calcScore, calcTendencia } from "./score";
import { runGuard, DISCLAIMER } from "./guard";
import type { HistoryStore } from "./historyStore";

export async function buildReport(
  motor: ResultadoOk,
  profile: HouseholdProfile,
  history: HistoryStore
): Promise<Report> {
  const capa1 = calcCapa1(motor);
  const capa3 = calcCapa3(motor);

  const { nivel, factores } = calcRiesgo(capa1.pctUltraprocesados, profile);

  const guard = await runGuard(motor, profile, nivel, capa1.pctUltraprocesados);

  const historialReciente = await history.recent(3);
  const ultimosScores = historialReciente.map((e) => e.score);
  const score = calcScore(capa1.pctUltraprocesados, nivel, profile, motor);
  const tendencia = calcTendencia(score, ultimosScores);
  const ahorroAcumuladoCLP = await history.totalAhorro();

  await history.append({
    fecha: new Date().toISOString(),
    score,
    ahorroAceptadoCLP: 0,
  });

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
