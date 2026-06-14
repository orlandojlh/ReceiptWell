import type { HouseholdProfile } from "./schema";

export type NivelRiesgo = "bajo" | "moderado" | "alto";

const NIVELES: NivelRiesgo[] = ["bajo", "moderado", "alto"];

function subirNivel(nivel: NivelRiesgo): NivelRiesgo {
  const idx = NIVELES.indexOf(nivel);
  return NIVELES[Math.min(idx + 1, NIVELES.length - 1)];
}

export interface RiesgoSaludBase {
  nivel: NivelRiesgo;
  factores: string[];
}

export function calcRiesgo(
  pctUltra: number,
  profile: HouseholdProfile
): RiesgoSaludBase {
  const factores: string[] = [];

  let nivel: NivelRiesgo;
  if (pctUltra < 25) {
    nivel = "bajo";
    factores.push(`${pctUltra.toFixed(1)}% del gasto en productos NOVA 4`);
  } else if (pctUltra <= 50) {
    nivel = "moderado";
    factores.push(`${pctUltra.toFixed(1)}% del gasto en productos NOVA 4 (supera el umbral del 25%)`);
  } else {
    nivel = "alto";
    factores.push(`${pctUltra.toFixed(1)}% del gasto en productos NOVA 4 (supera el umbral del 50%)`);
  }

  if (profile.condiciones.length > 0 && pctUltra > 25) {
    nivel = subirNivel(nivel);
    factores.push(
      `Condiciones de salud declaradas (${profile.condiciones.join(", ")}) con alto consumo ultraprocesado`
    );
  }

  if (profile.ninos > 0 && pctUltra > 40) {
    nivel = subirNivel(nivel);
    factores.push(
      `${profile.ninos} niño(s) en el hogar con ${pctUltra.toFixed(1)}% de gasto en ultraprocesados`
    );
  }

  return { nivel, factores };
}
