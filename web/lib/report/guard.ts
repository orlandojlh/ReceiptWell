import type { NivelRiesgo } from "./risk";
import {
  ReportIAResponseSchema,
  callReportPrompt,
  type ReportIAResponse,
} from "../prompts/report-v1";
import { FALLBACK_SWAPS } from "./fallback-swaps";
import type { ResultadoOk } from "../engine/schema";
import type { HouseholdProfile } from "./schema";

export const DISCLAIMER =
  "Este reporte no constituye consejo médico. Consulta a un profesional de la salud para decisiones sobre tu alimentación.";

const PALABRAS_PROHIBIDAS = [
  /\bcausa\b/i,
  /\bcausar[aá]/i,
  /\bprovoca\b/i,
  /\bprovocar[aá]/i,
  /\bproduce\b/i,
  /\bproducir[aá]/i,
  /\benfermar[aá]s\b/i,
  /\btendr[aá]s diabetes/i,
  /\btendr[aá]s hipertensi[oó]n/i,
  /\bdesarrollar[aá]s\b/i,
  /\bpadecer[aá]s\b/i,
  /\bte dar[aá]/i,
];

export const NARRATIVA_FALLBACK_TEST: Record<NivelRiesgo, string> = {
  bajo:
    "Tu boleta muestra un patrón alimentario mayormente saludable. Continuar priorizando alimentos frescos y mínimamente procesados está asociado a una mejor salud a largo plazo. Pequeños ajustes en los productos procesados pueden optimizar aún más tu alimentación.",
  moderado:
    "El consumo de ultraprocesados observado en esta boleta puede contribuir a desequilibrios nutricionales si se mantiene de forma frecuente. Reducir gradualmente estos productos y reemplazarlos por alternativas más naturales puede mejorar tu perfil alimentario. Los swaps sugeridos son un buen primer paso.",
  alto:
    "El alto porcentaje de ultraprocesados en esta boleta se relaciona con patrones alimentarios que pueden aumentar el riesgo de enfermedades crónicas. Priorizar los cambios sugeridos, especialmente el tipo 'salud', podría marcar una diferencia significativa en tu bienestar. Consulta a un nutricionista para un plan personalizado.",
};

const NARRATIVA_FALLBACK = NARRATIVA_FALLBACK_TEST;

export function scanarNarrativa(narrativa: string): string | null {
  for (const regex of PALABRAS_PROHIBIDAS) {
    const match = narrativa.match(regex);
    if (match) return match[0];
  }
  return null;
}

// Detecta porcentajes inventados: cualquier N% en la narrativa que difiera
// en más de 0.5 puntos del pct calculado en TypeScript (el que muestra la UI).
// Acepta formatos "9.8%", "9,8 %" (coma decimal y espacio opcionales).
export function scanarPorcentaje(narrativa: string, pctCalculado: number): string | null {
  const regex = /(\d+(?:[.,]\d+)?)\s*%/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(narrativa)) !== null) {
    const found = parseFloat(m[1].replace(",", "."));
    if (Math.abs(found - pctCalculado) > 0.5) return m[0];
  }
  return null;
}

export interface GuardResult {
  narrativa: string;
  swaps: ReportIAResponse["swaps"];
  useFallbackNarrativa: boolean;
  useFallbackSwaps: boolean;
}

export async function runGuard(
  motor: ResultadoOk,
  profile: HouseholdProfile,
  nivel: NivelRiesgo,
  pctUltraprocesados: number
): Promise<GuardResult> {
  let iaResponse: ReportIAResponse | null = null;
  let narrativaOk = false;
  let swapsOk = false;
  let correctionMsg: string | undefined;

  function validarNarrativa(texto: string): string | undefined {
    const issues: string[] = [];
    const palabraProhibida = scanarNarrativa(texto);
    if (palabraProhibida) {
      issues.push(`contiene la palabra prohibida "${palabraProhibida}" — usa SOLO "está asociado a" / "puede contribuir a"`);
    }
    const pctInventado = scanarPorcentaje(texto, pctUltraprocesados);
    if (pctInventado) {
      issues.push(`menciona "${pctInventado}" pero el porcentaje correcto es ${pctUltraprocesados.toFixed(1)}% — usa ese número exacto o evita mencionar porcentajes`);
    }
    return issues.length > 0
      ? `La narrativa ${issues.join("; ")}. Reescríbela respetando ambas restricciones.`
      : undefined;
  }

  try {
    const { parsed } = await callReportPrompt(motor, profile, nivel, pctUltraprocesados);
    const validation = ReportIAResponseSchema.safeParse(parsed);

    if (validation.success) {
      iaResponse = validation.data;
      correctionMsg = validarNarrativa(iaResponse.narrativaSalud);
      narrativaOk = correctionMsg === undefined;
      swapsOk = true;
    } else {
      correctionMsg = `JSON inválido o estructura incorrecta: ${JSON.stringify(validation.error.issues, null, 2)}`;
    }
  } catch (err) {
    correctionMsg = `Error al procesar la respuesta: ${String(err)}`;
  }

  if (correctionMsg) {
    console.error(`  Guard: intento 1 falló — ${correctionMsg.slice(0, 80)}. Reintentando...`);
    try {
      const { parsed } = await callReportPrompt(motor, profile, nivel, pctUltraprocesados, correctionMsg);
      const validation = ReportIAResponseSchema.safeParse(parsed);

      if (validation.success) {
        iaResponse = validation.data;
        const correction2 = validarNarrativa(iaResponse.narrativaSalud);
        narrativaOk = correction2 === undefined;
        swapsOk = true;
        if (!narrativaOk) {
          console.error(`  Guard: narrativa sigue inválida tras reintento. Usando fallback.`);
        }
      } else {
        console.error(`  Guard: validación falló en reintento. Usando fallbacks.`);
      }
    } catch (err) {
      console.error(`  Guard: reintento lanzó error: ${String(err)}. Usando fallbacks.`);
    }
  }

  return {
    narrativa: narrativaOk && iaResponse
      ? iaResponse.narrativaSalud
      : NARRATIVA_FALLBACK[nivel],
    swaps: swapsOk && iaResponse
      ? iaResponse.swaps
      : FALLBACK_SWAPS,
    useFallbackNarrativa: !narrativaOk || iaResponse === null,
    useFallbackSwaps: !swapsOk || iaResponse === null,
  };
}
