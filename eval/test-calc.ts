/**
 * Tests determinísticos para Fase 2.
 * Las capas 1 y 3 deben dar cifras exactas para las 3 boletas sintéticas.
 * No consume cuota de IA — es TypeScript puro.
 */
import { calcCapa1, calcCapa3 } from "../src/report/calc.js";
import { calcRiesgo } from "../src/report/risk.js";
import { calcScore, calcTendencia } from "../src/report/score.js";
import type { ResultadoOk } from "../src/engine/schema.js";
import type { HouseholdProfile } from "../src/report/schema.js";

// ─── Utilidad ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown): void {
  const ok =
    typeof expected === "number" && typeof actual === "number"
      ? Math.abs(actual - expected) < 0.001
      : JSON.stringify(actual) === JSON.stringify(expected);

  if (ok) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    console.error(`     esperado : ${JSON.stringify(expected)}`);
    console.error(`     obtenido : ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ─── Boletas sintéticas ───────────────────────────────────────────────────────

/**
 * Boleta 1 — hogar sin condiciones, bajo consumo NOVA 4
 * Total: $10 000   NOVA4: $2 000 (20%)   CalTotal: 1200   CalNOVA4: 300
 */
const boleta1: ResultadoOk = {
  estado: "ok",
  supermercado: "Lider",
  fecha_boleta: "2024-01-10",
  advertencias: [],
  productos: [
    { nombre: "Leche entera", nombre_boleta: "LECHE ENTERA", precio: 1290, cantidad: 1, categoria_nova: 1, confianza_nova: "alta", calorias_estimadas: 600, es_alimento: true },
    { nombre: "Arroz largo", nombre_boleta: "ARROZ LARGO", precio: 2490, cantidad: 1, categoria_nova: 1, confianza_nova: "alta", calorias_estimadas: 350, es_alimento: true },
    { nombre: "Manzanas", nombre_boleta: "MANZANA ROJA", precio: 1500, cantidad: 1, categoria_nova: 1, confianza_nova: "alta", calorias_estimadas: 80, es_alimento: true },
    { nombre: "Pan integral", nombre_boleta: "PAN INTEGRAL", precio: 1800, cantidad: 1, categoria_nova: 3, confianza_nova: "media", calorias_estimadas: 170, es_alimento: true },
    // NOVA 4: $920 + $1000 = $1920 → usaremos precio exacto para cuadrar
    { nombre: "Bebida cola", nombre_boleta: "COCA-COLA 1.5L", precio: 1490, cantidad: 1, categoria_nova: 4, confianza_nova: "alta", calorias_estimadas: 150, es_alimento: true },
    { nombre: "Snack papas", nombre_boleta: "PAPAS FRITAS 100G", precio: 990, cantidad: 1, categoria_nova: 4, confianza_nova: "alta", calorias_estimadas: 150, es_alimento: true },
  ],
  totales: {
    total_boleta: 9560,
    total_alimentos: 9560,
    total_nova4: 2480,        // 1490 + 990
    porcentaje_ultraprocesado: 25.9,
    calorias_totales: 1500,
  },
};
// Cifras esperadas capa 1
// pct = 2480/9560*100 = 25.9... → round(2480/9560*1000)/10
const b1_pct = Math.round((2480 / 9560) * 1000) / 10; // 25.9
const b1_proyAnual = 2480 * 4 * 12; // 119040

// Cifras esperadas capa 3
const b1_calUltra = 150 + 150; // 300
const b1_caminata = Math.round((300 / 250) * 10) / 10; // 1.2
const b1_trote    = Math.round((300 / 600) * 10) / 10; // 0.5
const b1_gym      = Math.round((300 / 400) * 10) / 10; // 0.8 (rounded to 0.8)

/**
 * Boleta 2 — hogar con 2 niños, alto consumo NOVA 4
 * Total: $20 000   NOVA4: $12 000 (60%)   CalTotal: 3500   CalNOVA4: 2000
 */
const boleta2: ResultadoOk = {
  estado: "ok",
  supermercado: "Jumbo",
  fecha_boleta: "2024-01-15",
  advertencias: [],
  productos: [
    { nombre: "Leche entera", nombre_boleta: "LECHE ENTERA", precio: 1290, cantidad: 1, categoria_nova: 1, confianza_nova: "alta", calorias_estimadas: 600, es_alimento: true },
    { nombre: "Pollo entero", nombre_boleta: "POLLO ENTERO", precio: 4500, cantidad: 1, categoria_nova: 1, confianza_nova: "alta", calorias_estimadas: 900, es_alimento: true },
    // NOVA 4: $14210
    { nombre: "Galletas rellenas", nombre_boleta: "GALLETAS RELLENAS", precio: 1990, cantidad: 2, categoria_nova: 4, confianza_nova: "alta", calorias_estimadas: 500, es_alimento: true },
    { nombre: "Cereal azucarado", nombre_boleta: "CEREAL CHOCO", precio: 3290, cantidad: 1, categoria_nova: 4, confianza_nova: "alta", calorias_estimadas: 400, es_alimento: true },
    { nombre: "Bebida naranja", nombre_boleta: "JUGO NARANJA 1L", precio: 1490, cantidad: 2, categoria_nova: 4, confianza_nova: "alta", calorias_estimadas: 200, es_alimento: true },
    { nombre: "Nuggets pollo", nombre_boleta: "NUGGETS 500G", precio: 3490, cantidad: 1, categoria_nova: 4, confianza_nova: "alta", calorias_estimadas: 700, es_alimento: true },
  ],
  totales: {
    total_boleta: 21530,
    total_alimentos: 21530,
    // 1990*2 + 3290 + 1490*2 + 3490 = 3980 + 3290 + 2980 + 3490 = 13740
    total_nova4: 13740,
    porcentaje_ultraprocesado: 63.8,
    calorias_totales: 3500,
  },
};
// Cifras esperadas boleta 2
const b2_pct = Math.round((13740 / 21530) * 1000) / 10;
const b2_proyAnual = 13740 * 4 * 12;
// calUltra: 500*2 + 400 + 200*2 + 700 = 1000+400+400+700 = 2500
const b2_calUltra = 500 * 2 + 400 + 200 * 2 + 700; // 2500
const b2_caminata = Math.round((b2_calUltra / 250) * 10) / 10;
const b2_trote    = Math.round((b2_calUltra / 600) * 10) / 10;
const b2_gym      = Math.round((b2_calUltra / 400) * 10) / 10;

/**
 * Boleta 3 — sin productos NOVA 4 (boleta "limpia")
 * Total: $8 500   NOVA4: $0 (0%)   CalTotal: 900
 */
const boleta3: ResultadoOk = {
  estado: "ok",
  supermercado: "Santa Isabel",
  fecha_boleta: "2024-01-20",
  advertencias: [],
  productos: [
    { nombre: "Avena", nombre_boleta: "AVENA TRADICIONAL", precio: 990, cantidad: 1, categoria_nova: 1, confianza_nova: "alta", calorias_estimadas: 380, es_alimento: true },
    { nombre: "Huevos", nombre_boleta: "HUEVOS 12UN", precio: 2490, cantidad: 1, categoria_nova: 1, confianza_nova: "alta", calorias_estimadas: 210, es_alimento: true },
    { nombre: "Tomates", nombre_boleta: "TOMATE KILO", precio: 990, cantidad: 1, categoria_nova: 1, confianza_nova: "alta", calorias_estimadas: 35, es_alimento: true },
    { nombre: "Porotos", nombre_boleta: "POROTOS 1KG", precio: 1590, cantidad: 1, categoria_nova: 1, confianza_nova: "alta", calorias_estimadas: 275, es_alimento: true },
    { nombre: "Detergente", nombre_boleta: "DETERGENTE 1L", precio: 2490, cantidad: 1, categoria_nova: 1, confianza_nova: "alta", calorias_estimadas: 0, es_alimento: false },
  ],
  totales: {
    total_boleta: 8550,
    total_alimentos: 6060,
    total_nova4: 0,
    porcentaje_ultraprocesado: 0,
    calorias_totales: 900,
  },
};

// ─── Suite de tests ───────────────────────────────────────────────────────────

console.log("\n=== FASE 2 — Tests determinísticos ===\n");

// ── Capa 1: Boleta 1 ──────────────────────────────────────────────────────────
console.log("── Capa 1: Boleta 1 (bajo consumo NOVA 4) ──");
{
  const c1 = calcCapa1(boleta1);
  assert("totalBoleta", c1.totalBoleta, 9560);
  assert("totalUltraprocesados", c1.totalUltraprocesados, 2480);
  assert("pctUltraprocesados", c1.pctUltraprocesados, b1_pct);
  assert("proyeccionAnualUltra", c1.proyeccionAnualUltra, b1_proyAnual);
  assert("frecuenciaAsumida", c1.frecuenciaAsumida, 4);
}

// ── Capa 1: Boleta 2 ──────────────────────────────────────────────────────────
console.log("\n── Capa 1: Boleta 2 (alto consumo NOVA 4 con niños) ──");
{
  const c1 = calcCapa1(boleta2);
  assert("totalBoleta", c1.totalBoleta, 21530);
  assert("totalUltraprocesados", c1.totalUltraprocesados, 13740);
  assert("pctUltraprocesados", c1.pctUltraprocesados, b2_pct);
  assert("proyeccionAnualUltra", c1.proyeccionAnualUltra, b2_proyAnual);
}

// ── Capa 1: Boleta 3 ──────────────────────────────────────────────────────────
console.log("\n── Capa 1: Boleta 3 (sin NOVA 4) ──");
{
  const c1 = calcCapa1(boleta3);
  assert("totalUltraprocesados", c1.totalUltraprocesados, 0);
  assert("pctUltraprocesados", c1.pctUltraprocesados, 0);
  assert("proyeccionAnualUltra", c1.proyeccionAnualUltra, 0);
}

// ── Capa 3: Boleta 1 ──────────────────────────────────────────────────────────
console.log("\n── Capa 3: Boleta 1 ──");
{
  const c3 = calcCapa3(boleta1);
  assert("caloriasTotales", c3.caloriasTotales, 1500);
  assert("caloriasUltra", c3.caloriasUltra, b1_calUltra);
  assert("caminataHoras", c3.equivalencias.caminataHoras, b1_caminata);
  assert("troteHoras", c3.equivalencias.troteHoras, b1_trote);
  assert("gimnasioSesiones", c3.equivalencias.gimnasioSesiones, b1_gym);
}

// ── Capa 3: Boleta 2 ──────────────────────────────────────────────────────────
console.log("\n── Capa 3: Boleta 2 ──");
{
  const c3 = calcCapa3(boleta2);
  assert("caloriasUltra", c3.caloriasUltra, b2_calUltra);
  assert("caminataHoras", c3.equivalencias.caminataHoras, b2_caminata);
  assert("troteHoras", c3.equivalencias.troteHoras, b2_trote);
  assert("gimnasioSesiones", c3.equivalencias.gimnasioSesiones, b2_gym);
}

// ── Capa 3: Boleta 3 (sin calorías NOVA 4) ───────────────────────────────────
console.log("\n── Capa 3: Boleta 3 (sin NOVA 4) ──");
{
  const c3 = calcCapa3(boleta3);
  assert("caloriasUltra", c3.caloriasUltra, 0);
  assert("caminataHoras", c3.equivalencias.caminataHoras, 0);
}

// ── Riesgo: reglas y modificadores ───────────────────────────────────────────
console.log("\n── Riesgo: reglas base y modificadores ──");
{
  const perfilBase: HouseholdProfile = { adultos: 1, ninos: 0, objetivo: "equilibrio", condiciones: [] };
  const perfilCondiciones: HouseholdProfile = { adultos: 1, ninos: 0, objetivo: "salud", condiciones: ["hipertension"] };
  const perfilNinos: HouseholdProfile = { adultos: 2, ninos: 2, objetivo: "salud", condiciones: [] };
  const perfilCombinado: HouseholdProfile = { adultos: 2, ninos: 2, objetivo: "salud", condiciones: ["diabetes"] };

  assert("pct=15% → bajo", calcRiesgo(15, perfilBase).nivel, "bajo");
  assert("pct=30% → moderado", calcRiesgo(30, perfilBase).nivel, "moderado");
  assert("pct=60% → alto", calcRiesgo(60, perfilBase).nivel, "alto");

  // Modificador condiciones: pct=30% + hipertension → sube de moderado a alto
  assert("pct=30% + condicion → alto", calcRiesgo(30, perfilCondiciones).nivel, "alto");

  // Modificador niños: pct=45% + 2 niños → sube de moderado a alto
  assert("pct=45% + niños → alto", calcRiesgo(45, perfilNinos).nivel, "alto");

  // Tope en "alto": pct=60% + condicion + niños → sigue siendo alto
  assert("pct=60% + todo → sigue alto", calcRiesgo(60, perfilCombinado).nivel, "alto");

  // pct=15% con condiciones: no modifica (condicion solo aplica si pct>25%)
  assert("pct=15% + condicion → bajo (no modifica)", calcRiesgo(15, perfilCondiciones).nivel, "bajo");

  // Factores no vacíos
  const r = calcRiesgo(60, perfilCombinado);
  assert("factores no vacíos", r.factores.length > 0, true);
}

// ── Score: cálculo y tendencia ────────────────────────────────────────────────
console.log("\n── Score: cálculo y tendencia ──");
{
  const perfilBase: HouseholdProfile = { adultos: 1, ninos: 0, objetivo: "equilibrio", condiciones: [] };
  const perfilCondAlto: HouseholdProfile = { adultos: 1, ninos: 0, objetivo: "salud", condiciones: ["diabetes"] };

  // boleta3 pct=0 → score base 100, sin bonus (no hay top-5 NOVA1 que exceda 2, aunque hay 4 pero verifiquemos)
  // top5 NOVA1 en boleta3: avena(1), huevos(1), tomates(1), porotos(1) → 4 NOVA1 → bonus +5 → 105 → clamp 100
  const s3 = calcScore(0, "bajo", perfilBase, boleta3);
  assert("pct=0 + bonus NOVA1 → 100 (clamp)", s3, 100);

  // boleta1 pct≈25.9 → score = 100 - 25.9 = 74.1 → round 74
  // top5: leche(1), arroz(1), pan(3), bebida(4), snack(4) → 2 NOVA1 → +5 → 79
  const s1 = calcScore(b1_pct, "moderado", perfilBase, boleta1);
  assert("boleta1 score con bonus NOVA1 (2 en top5)", s1, Math.min(100, Math.max(0, Math.round(100 - b1_pct + 5))));

  // Penalización: nivel alto + condicion → -5
  // boleta2 pct≈63.8 → 100-63.8=36.2 → round=36 → -5 (condicion+alto) → 31
  // top5 por gasto: pollo(4500), galletas(3980), nuggets(3490), cereal(3290), bebida(2980)
  // solo 1 NOVA1 en top5 (pollo) → bonus +5 NO aplica → score final = 31
  const s2 = calcScore(b2_pct, "alto", perfilCondAlto, boleta2);
  const s2Expected = Math.min(100, Math.max(0, Math.round(100 - b2_pct) - 5));
  assert("boleta2 score con penalizacion sin bonus (1 NOVA1 en top5)", s2, s2Expected);

  // Tendencia primera boleta
  assert("sin historial → primera_boleta", calcTendencia(75, []), "primera_boleta");

  // Tendencia estable (diff ≤ 3)
  assert("diff=2 → estable", calcTendencia(75, [74, 73, 72]), "estable");

  // Tendencia mejorando (diff > 3)
  assert("diff=10 → mejorando", calcTendencia(80, [70, 70, 70]), "mejorando");

  // Tendencia empeorando (diff < -3)
  assert("diff=-10 → empeorando", calcTendencia(60, [70, 70, 70]), "empeorando");
}

// ─── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(45)}`);
console.log(`Resultado: ${passed} pasaron · ${failed} fallaron`);
if (failed > 0) {
  console.error("\n⚠  Hay tests fallidos — revisar la implementación.");
  process.exit(1);
} else {
  console.log("\n✓  Todos los tests pasaron.");
}
