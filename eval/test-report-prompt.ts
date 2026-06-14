/**
 * Prueba de integración FASE 3 — UNA boleta real.
 * Consume 2 llamadas IA: 1 de analyze + 1 de report prompt.
 * Uso: npx tsx eval/test-report-prompt.ts <ruta_boleta>
 */
import { analyzeReceipt } from "../src/engine/analyze.js";
import { calcCapa1 } from "../src/report/calc.js";
import { calcRiesgo } from "../src/report/risk.js";
import { runGuard, DISCLAIMER } from "../src/report/guard.js";
import { HouseholdProfileSchema } from "../src/report/schema.js";

const boletaPath = process.argv[2] ?? "./boletas/PRUEBA2.pdf";

const profile = HouseholdProfileSchema.parse({
  adultos: 2,
  ninos: 1,
  objetivo: "equilibrio",
  condiciones: [],
});

console.log(`\n${"═".repeat(55)}`);
console.log("  FASE 3 — Prueba con boleta real");
console.log(`  Archivo : ${boletaPath}`);
console.log(`  Perfil  : ${profile.adultos} adultos · ${profile.ninos} niño · objetivo: ${profile.objetivo}`);
console.log(`${"═".repeat(55)}\n`);

// ── Paso 1: analizar boleta ──────────────────────────────────────────────────
console.log("► Paso 1: analizando boleta...");
const motor = await analyzeReceipt(boletaPath);

if (motor.estado === "rechazo") {
  console.error(`\n✗ Boleta rechazada: ${motor.motivo} — ${motor.mensaje_usuario}`);
  process.exit(1);
}

console.log(`  Supermercado : ${motor.supermercado}`);
console.log(`  Productos    : ${motor.productos.length}`);
console.log(`  Total boleta : $${motor.totales.total_boleta.toLocaleString("es-CL")} CLP`);
console.log(`  % NOVA 4     : ${motor.totales.porcentaje_ultraprocesado.toFixed(1)}%`);

// ── Paso 2: cálculos determinísticos ────────────────────────────────────────
const capa1 = calcCapa1(motor);
const { nivel, factores } = calcRiesgo(capa1.pctUltraprocesados, profile);

console.log(`\n► Paso 2: cálculos`);
console.log(`  Nivel de riesgo : ${nivel}`);
console.log(`  Factores        : ${factores.join(" | ")}`);

// ── Paso 3: llamar IA + guardián ─────────────────────────────────────────────
console.log(`\n► Paso 3: llamando IA (report-v1)...`);
const guard = await runGuard(motor, profile, nivel);

// ── Resultado ────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(55)}`);
console.log("  CAPA 2 — Narrativa de salud");
console.log(`${"─".repeat(55)}`);
console.log(`\n${guard.narrativa}`);
console.log(`\n[Disclaimer] ${DISCLAIMER}`);
if (guard.useFallbackNarrativa) console.log("  ⚠ Se usó narrativa de FALLBACK");

console.log(`\n${"─".repeat(55)}`);
console.log("  CAPA 4 — Plan de corrección (3 swaps)");
console.log(`${"─".repeat(55)}`);

for (let i = 0; i < guard.swaps.length; i++) {
  const s = guard.swaps[i];
  console.log(`\n  Swap ${i + 1} [${s.tipo.toUpperCase()}]`);
  console.log(`  ✗ Producto     : ${s.producto}`);
  console.log(`  ✓ Alternativa  : ${s.alternativa}`);
  console.log(`  💰 Ahorro/mes  : $${s.ahorroCLPMes.toLocaleString("es-CL")} CLP`);
  console.log(`  🥗 Nutricional : ${s.diferenciaNutricional}`);
  console.log(`  🏪 Disponible  : ${s.disponibleEn.join(", ")}`);
}
if (guard.useFallbackSwaps) console.log("\n  ⚠ Se usaron swaps de FALLBACK");

console.log(`\n${"═".repeat(55)}\n`);
