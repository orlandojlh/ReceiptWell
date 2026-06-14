import type { ResultadoOk } from "../engine/schema.js";

// Constantes de gasto calórico por actividad (adulto ~70 kg, valores estándar OMS/ACSM)
const KCAL_POR_HORA_CAMINATA = 250; // kcal/h — marcha moderada
const KCAL_POR_HORA_TROTE = 600;    // kcal/h — trote a ~8 km/h
const KCAL_POR_SESION_GIMNASIO = 400; // kcal/sesión de 1 hora

const FRECUENCIA_DEFAULT = 4; // boletas/mes asumidas cuando no hay historial real

export interface Capa1 {
  totalBoleta: number;
  totalUltraprocesados: number;
  pctUltraprocesados: number;
  proyeccionAnualUltra: number;
  frecuenciaAsumida: number;
}

export interface Capa3 {
  caloriasTotales: number;
  caloriasUltra: number;
  equivalencias: {
    caminataHoras: number;
    troteHoras: number;
    gimnasioSesiones: number;
  };
}

export function calcCapa1(
  motor: ResultadoOk,
  frecuencia = FRECUENCIA_DEFAULT
): Capa1 {
  const totalBoleta = motor.totales.total_boleta;
  const totalUltraprocesados = motor.totales.total_nova4;
  const pctUltraprocesados =
    totalBoleta > 0
      ? Math.round((totalUltraprocesados / totalBoleta) * 1000) / 10
      : 0;
  const proyeccionAnualUltra = totalUltraprocesados * frecuencia * 12;

  return {
    totalBoleta,
    totalUltraprocesados,
    pctUltraprocesados,
    proyeccionAnualUltra,
    frecuenciaAsumida: frecuencia,
  };
}

export function calcCapa3(motor: ResultadoOk): Capa3 {
  const caloriasTotales = motor.totales.calorias_totales;

  const caloriasUltra = motor.productos
    .filter((p) => p.categoria_nova === 4)
    .reduce((sum, p) => sum + p.calorias_estimadas * p.cantidad, 0);

  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    caloriasTotales,
    caloriasUltra,
    equivalencias: {
      caminataHoras: round1(caloriasUltra / KCAL_POR_HORA_CAMINATA),
      troteHoras: round1(caloriasUltra / KCAL_POR_HORA_TROTE),
      gimnasioSesiones: round1(caloriasUltra / KCAL_POR_SESION_GIMNASIO),
    },
  };
}
