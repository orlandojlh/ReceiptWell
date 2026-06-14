/**
 * Tests automáticos para guard.ts — sin consumir cuota de IA.
 * Verifica: detección de palabras prohibidas, fallback narrativa y fallback swaps.
 */
import { scanarNarrativa, DISCLAIMER, NARRATIVA_FALLBACK_TEST } from "../src/report/guard.js";
import { FALLBACK_SWAPS } from "../src/report/fallback-swaps.js";

let passed = 0;
let failed = 0;

function assert(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
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

// Verifica que scanarNarrativa detecta una palabra (devuelve !null)
function assertDetecta(label: string, texto: string): void {
  const resultado = scanarNarrativa(texto);
  if (resultado !== null) {
    console.log(`  ✓  ${label} (detectó: "${resultado}")`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    console.error(`     esperaba detectar algo en: "${texto}"`);
    failed++;
  }
}

function assertContains(label: string, text: string, fragment: string): void {
  if (text.includes(fragment)) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    console.error(`     texto   : "${text.slice(0, 120)}..."`);
    console.error(`     buscado : "${fragment}"`);
    failed++;
  }
}

function assertNotContains(label: string, text: string, fragment: string): void {
  if (!text.toLowerCase().includes(fragment.toLowerCase())) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    console.error(`     texto contiene la palabra prohibida: "${fragment}"`);
    failed++;
  }
}

console.log("\n=== FASE 3 — Tests del guardián (sin cuota IA) ===\n");

// ── Detección de palabras prohibidas ─────────────────────────────────────────
console.log("── scanarNarrativa: palabras prohibidas ──");
// assertDetecta: solo verifica que se detectó algo (!== null), sin comparar casing exacto
assertDetecta('detecta "causa"',         "El azúcar causa obesidad.");
assertDetecta('detecta "provoca"',       "Esto provoca diabetes.");
assertDetecta('detecta "enfermarás"',    "Con esta dieta enfermarás.");
assertDetecta('detecta "desarrollarás"', "Desarrollarás hipertensión.");
assertDetecta('detecta "padecerás"',     "Padecerás problemas graves.");
assertDetecta('detecta "producirá"',     "Esto producirá daño en tu salud.");
assertDetecta('detecta "te dará"',       "Te dará diabetes si sigues así.");
assertDetecta('detecta "causará"',       "Causará problemas a futuro.");
assertDetecta('detecta "provocará"',     "Provocará inflamación crónica.");

// Lenguaje permitido → debe devolver null
assert('permite "asociado a"',         scanarNarrativa("El patrón está asociado a mayor riesgo."), null);
assert('permite "puede contribuir a"', scanarNarrativa("El consumo puede contribuir a desequilibrios."), null);
assert('permite "se relaciona con"',   scanarNarrativa("Este hábito se relaciona con el sobrepeso."), null);
assert('permite "podría aumentar"',    scanarNarrativa("Podría aumentar el riesgo cardiovascular."), null);

// Case-insensitive — assertDetecta no compara casing
assertDetecta('case-insensitive "CAUSA"',   "Esto CAUSA daño.");
assertDetecta('case-insensitive "Provoca"', "Provoca problemas.");

// ── Disclaimer siempre presente (valor fijo en código) ───────────────────────
console.log("\n── Disclaimer fijo ──");
assertContains(
  "disclaimer contiene texto correcto",
  DISCLAIMER,
  "Este reporte no constituye consejo médico"
);
assertContains(
  "disclaimer menciona profesional de salud",
  DISCLAIMER,
  "profesional de la salud"
);

// ── Fallback swaps: estructura válida ─────────────────────────────────────────
console.log("\n── Fallback swaps: estructura ──");
assert("exactamente 3 swaps de fallback", FALLBACK_SWAPS.length, 3);
assert("tipos distintos en fallback",
  [...new Set(FALLBACK_SWAPS.map((s) => s.tipo))].sort(),
  ["dinero", "equilibrio", "salud"]
);
for (const swap of FALLBACK_SWAPS) {
  assert(`swap "${swap.tipo}" tiene ahorroCLPMes numérico`, typeof swap.ahorroCLPMes, "number");
  assert(`swap "${swap.tipo}" tiene diferenciaNutricional`, swap.diferenciaNutricional.length > 0, true);
  assert(`swap "${swap.tipo}" disponibleEn no vacío`, swap.disponibleEn.length > 0, true);
}

// ── Narrativas de fallback: lenguaje protegido ────────────────────────────────
console.log("\n── Narrativas de fallback: lenguaje protegido ──");
const niveles = ["bajo", "moderado", "alto"] as const;
for (const nivel of niveles) {
  const narrativa = NARRATIVA_FALLBACK_TEST[nivel];
  assert(`fallback ${nivel}: no es vacía`, narrativa.length > 0, true);
  assertNotContains(`fallback ${nivel}: sin "causa"`,       narrativa, "causa");
  assertNotContains(`fallback ${nivel}: sin "provoca"`,     narrativa, "provoca");
  assertNotContains(`fallback ${nivel}: sin "enfermarás"`,  narrativa, "enfermarás");
  assertNotContains(`fallback ${nivel}: sin "desarrollarás"`, narrativa, "desarrollarás");
}

// ─── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(45)}`);
console.log(`Resultado: ${passed} pasaron · ${failed} fallaron`);
if (failed > 0) {
  console.error("\n⚠  Hay tests fallidos.");
  process.exit(1);
} else {
  console.log("\n✓  Todos los tests pasaron.");
}
