/**
 * FASE 5 — Evaluación con boletas reales
 * - Reutiliza motores ya extraídos (caché en data/motores/)
 * - Genera 16 reportes (8 boletas × 2 perfiles)
 * - Completa el checklist de S3
 * - Se detiene con gracia si hay error de cuota y guarda avance
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { analyzeReceipt } from "../src/engine/analyze.js";
import { buildReport } from "../src/report/build.js";
import { createLocalHistoryStore } from "../src/report/history.js";
import { HouseholdProfileSchema, type Report } from "../src/report/schema.js";
import { ResultadoOkSchema, type ResultadoOk } from "../src/engine/schema.js";
import { calcCapa1 } from "../src/report/calc.js";

dotenv.config();

// ─── Directorios ──────────────────────────────────────────────────────────────
const BOLETAS_DIR   = path.join(process.cwd(), "boletas");
const MOTORES_DIR   = path.join(process.cwd(), "data", "motores");
const REPORTES_DIR  = path.join(process.cwd(), "data", "reportes", "fase5");
const EVAL_DIR      = path.join(process.cwd(), "eval");

for (const d of [MOTORES_DIR, REPORTES_DIR]) fs.mkdirSync(d, { recursive: true });

// ─── Perfiles del spec ────────────────────────────────────────────────────────
const PERFILES = [
  HouseholdProfileSchema.parse({
    adultos: 1, ninos: 0,
    objetivo: "ahorrar",
    condiciones: [],
  }),
  HouseholdProfileSchema.parse({
    adultos: 2, ninos: 2,
    objetivo: "salud",
    condiciones: ["hipertension"],
  }),
] as const;

const PERFIL_LABELS = ["P1_1adulto_ahorrar", "P2_2adultos2ninos_salud"] as const;

// ─── Boletas a procesar (PDFs + imágenes) ─────────────────────────────────────
const ALL_BOLETAS = fs
  .readdirSync(BOLETAS_DIR)
  .filter((f) => /\.(pdf|jpe?g|png|webp|heic)$/i.test(f))
  .sort();

console.log(`\nBoletas encontradas (${ALL_BOLETAS.length}): ${ALL_BOLETAS.join(", ")}\n`);

// ─── Tipos internos ───────────────────────────────────────────────────────────
interface ReportEntry {
  boleta: string;
  perfil: string;
  tiempoReporteMs: number;
  tiempoTotalMs: number;
  pctUltra: number;
  nivel: string;
  score: number;
  ok: boolean;
  error?: string;
  report?: Report;
}

// ─── Caché de motores ─────────────────────────────────────────────────────────
function motorCachePath(boleta: string): string {
  const base = path.basename(boleta, path.extname(boleta));
  return path.join(MOTORES_DIR, `${base}.json`);
}

function loadMotorCache(boleta: string): ResultadoOk | null {
  const p = motorCachePath(boleta);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    const v = ResultadoOkSchema.safeParse(raw);
    return v.success ? v.data : null;
  } catch { return null; }
}

function saveMotorCache(boleta: string, motor: ResultadoOk): void {
  fs.writeFileSync(motorCachePath(boleta), JSON.stringify(motor, null, 2), "utf-8");
}

// ─── Detección de error de cuota ─────────────────────────────────────────────
function isQuotaError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return msg.includes("429") || msg.includes("quota") || msg.includes("resource_exhausted")
    || msg.includes("rate limit") || msg.includes("too many");
}

// ─── Formateador de reporte para RESUMEN ──────────────────────────────────────
function clp(n: number): string { return `$${n.toLocaleString("es-CL")} CLP`; }

function formatReportMd(r: Report, boleta: string, perfil: string): string {
  const s = r;
  const c1 = s.capa1_espejoFinanciero;
  const c2 = s.capa2_riesgoSalud;
  const c3 = s.capa3_costoEnSudor;
  const c4 = s.capa4_planCorreccion;
  const m  = s.marcador;

  let out = `### Boleta: ${boleta} | Perfil: ${perfil}\n\n`;
  out += `**ID:** ${s.boletaId}  \n**Fecha:** ${s.fecha}\n\n`;

  out += `#### CAPA 1 · Espejo Financiero\n\n`;
  out += `| Campo | Valor |\n|---|---|\n`;
  out += `| Total boleta | ${clp(c1.totalBoleta)} |\n`;
  out += `| Total ultraprocesados | ${clp(c1.totalUltraprocesados)} |\n`;
  out += `| % ultraprocesados | ${c1.pctUltraprocesados.toFixed(1)}% |\n`;
  out += `| Proyección anual | ${clp(c1.proyeccionAnualUltra)} |\n`;
  out += `| Frecuencia asumida | ${c1.frecuenciaAsumida} boletas/mes |\n\n`;

  out += `#### CAPA 2 · Riesgo de Salud\n\n`;
  out += `**Nivel:** ${c2.nivel.toUpperCase()}  \n`;
  out += `**Factores:** ${c2.factores.join("; ")}  \n\n`;
  out += `**Narrativa:**\n> ${c2.narrativa}\n\n`;
  out += `*${c2.disclaimer}*\n\n`;

  out += `#### CAPA 3 · Costo en Sudor\n\n`;
  out += `| | |\n|---|---|\n`;
  out += `| Calorías totales | ${c3.caloriasTotales} kcal |\n`;
  out += `| Calorías ultraprocesados | ${c3.caloriasUltra} kcal |\n`;
  out += `| Caminata equiv. | ${c3.equivalencias.caminataHoras} h |\n`;
  out += `| Trote equiv. | ${c3.equivalencias.troteHoras} h |\n`;
  out += `| Gimnasio equiv. | ${c3.equivalencias.gimnasioSesiones} sesiones |\n\n`;

  out += `#### CAPA 4 · Plan de Corrección\n\n`;
  c4.swaps.forEach((sw, i) => {
    out += `**Swap ${i + 1} [${sw.tipo.toUpperCase()}]**  \n`;
    out += `- Reemplaza: ${sw.producto}  \n`;
    out += `- Por: ${sw.alternativa}  \n`;
    out += `- Ahorro/mes: ${clp(sw.ahorroCLPMes)}  \n`;
    out += `- Diferencia nutricional: ${sw.diferenciaNutricional}  \n`;
    out += `- Disponible en: ${sw.disponibleEn.join(", ")}  \n\n`;
  });

  out += `#### Marcador\n\n`;
  out += `| Score | Tendencia | Ahorro acumulado |\n|---|---|---|\n`;
  out += `| ${m.score}/100 | ${m.tendencia} | ${clp(m.ahorroAcumuladoCLP)} |\n\n`;

  return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const results: ReportEntry[] = [];
let quotaHit = false;
let totalIaCalls = 0;

const history = createLocalHistoryStore();

for (const boleta of ALL_BOLETAS) {
  if (quotaHit) break;
  const boletaPath = path.join(BOLETAS_DIR, boleta);
  const base = path.basename(boleta, path.extname(boleta));

  // ── Paso 1: obtener motor (caché o extraer) ────────────────────────────────
  let motor = loadMotorCache(boleta);
  let tiempoExtraccionMs = 0;

  if (!motor) {
    console.log(`\n[${base}] Extrayendo motor (no hay caché)...`);
    const t0 = Date.now();
    try {
      const resultado = await analyzeReceipt(boletaPath);
      tiempoExtraccionMs = Date.now() - t0;
      totalIaCalls++;

      if (resultado.estado === "rechazo") {
        console.log(`  → Rechazada: ${resultado.motivo}`);
        for (const pLabel of PERFIL_LABELS) {
          results.push({
            boleta: base, perfil: pLabel,
            tiempoReporteMs: 0, tiempoTotalMs: tiempoExtraccionMs,
            pctUltra: 0, nivel: "rechazo", score: 0,
            ok: false, error: `rechazo:${resultado.motivo}`,
          });
        }
        continue;
      }

      motor = resultado;
      saveMotorCache(boleta, motor);
      console.log(`  → Extraído y guardado en caché (${(tiempoExtraccionMs / 1000).toFixed(1)}s, llamada #${totalIaCalls})`);
    } catch (err) {
      tiempoExtraccionMs = Date.now() - t0;
      if (isQuotaError(err)) {
        console.error(`\n⚠ CUOTA AGOTADA al extraer ${base}. Deteniendo.`);
        quotaHit = true;
        break;
      }
      console.error(`  → Error extrayendo ${base}: ${err}`);
      for (const pLabel of PERFIL_LABELS) {
        results.push({
          boleta: base, perfil: pLabel,
          tiempoReporteMs: 0, tiempoTotalMs: tiempoExtraccionMs,
          pctUltra: 0, nivel: "error", score: 0,
          ok: false, error: String(err),
        });
      }
      continue;
    }
  } else {
    console.log(`\n[${base}] Motor cargado desde caché ✓`);
  }

  // ── Paso 2: generar reporte × 2 perfiles ──────────────────────────────────
  for (let pi = 0; pi < PERFILES.length; pi++) {
    if (quotaHit) break;
    const profile = PERFILES[pi];
    const pLabel  = PERFIL_LABELS[pi];

    // Verificar si el reporte ya existe
    const reportFile = path.join(REPORTES_DIR, `${base}_${pLabel}.json`);
    if (fs.existsSync(reportFile)) {
      const saved = JSON.parse(fs.readFileSync(reportFile, "utf-8")) as Report;
      const c1 = saved.capa1_espejoFinanciero;
      console.log(`  [${pLabel}] Reporte ya existe, reutilizando ✓`);
      results.push({
        boleta: base, perfil: pLabel,
        tiempoReporteMs: 0, tiempoTotalMs: 0,
        pctUltra: c1.pctUltraprocesados,
        nivel: saved.capa2_riesgoSalud.nivel,
        score: saved.marcador.score,
        ok: true, report: saved,
      });
      continue;
    }

    console.log(`  [${pLabel}] Generando reporte (llamada #${totalIaCalls + 1})...`);
    const t0 = Date.now();
    try {
      const report = await buildReport(motor, profile, history);
      const tiempoReporteMs = Date.now() - t0;
      totalIaCalls++;

      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf-8");

      const c1 = report.capa1_espejoFinanciero;
      console.log(`  → OK ${(tiempoReporteMs / 1000).toFixed(1)}s | ${c1.pctUltraprocesados.toFixed(1)}% ultra | score ${report.marcador.score} | nivel ${report.capa2_riesgoSalud.nivel}`);

      results.push({
        boleta: base, perfil: pLabel,
        tiempoReporteMs,
        tiempoTotalMs: tiempoExtraccionMs + tiempoReporteMs,
        pctUltra: c1.pctUltraprocesados,
        nivel: report.capa2_riesgoSalud.nivel,
        score: report.marcador.score,
        ok: true, report,
      });
    } catch (err) {
      const tiempoReporteMs = Date.now() - t0;
      if (isQuotaError(err)) {
        console.error(`\n⚠ CUOTA AGOTADA al generar reporte ${base}/${pLabel}. Deteniendo.`);
        quotaHit = true;
        break;
      }
      console.error(`  → Error: ${err}`);
      results.push({
        boleta: base, perfil: pLabel,
        tiempoReporteMs, tiempoTotalMs: tiempoExtraccionMs + tiempoReporteMs,
        pctUltra: 0, nivel: "error", score: 0,
        ok: false, error: String(err),
      });
    }
  }
}

// ─── Checklist y resumen ──────────────────────────────────────────────────────
const okResults = results.filter((r) => r.ok && r.report);
const totalEsperados = ALL_BOLETAS.length * 2;
const totalGenerados = okResults.length;

console.log(`\n${"═".repeat(55)}`);
console.log(`Reportes generados: ${totalGenerados} / ${totalEsperados}`);
console.log(`Llamadas IA usadas en esta ejecución: ${totalIaCalls}`);
if (quotaHit) console.log("⚠ Ejecución incompleta — cuota agotada.");
console.log("═".repeat(55));

// Reporte con mayor % ultraprocesados
const topReport = okResults.sort((a, b) => b.pctUltra - a.pctUltra)[0];

// ─── Generar checklist-s3.md ─────────────────────────────────────────────────
function checklistLine(ok: boolean, text: string): string {
  return `- [${ok ? "x" : " "}] ${text}`;
}

let checklist = `# Checklist S3 — Evaluación Fase 5\n\n`;
checklist += `_Generado: ${new Date().toISOString()}_  \n`;
checklist += `_Reportes completados: ${totalGenerados}/${totalEsperados}_\n\n`;

checklist += `## Criterios por reporte\n\n`;

for (const r of results) {
  checklist += `### ${r.boleta} — ${r.perfil}\n\n`;
  if (!r.ok) {
    checklist += `> ⚠ Error: ${r.error ?? "desconocido"}\n\n`;
    continue;
  }
  const rep = r.report!;
  const c1 = rep.capa1_espejoFinanciero;
  const c2 = rep.capa2_riesgoSalud;
  const c3 = rep.capa3_costoEnSudor;
  const c4 = rep.capa4_planCorreccion;

  const cap1Ok = c1.totalBoleta > 0 && c1.pctUltraprocesados >= 0;
  const cap2LenguajeOk = !c2.narrativa.match(/\bcausa\b|\bprovoca\b|\benfermar[aá]s\b|\bdesarrollar[aá]s\b/i);
  const cap2DisclaimerOk = c2.disclaimer.includes("no constituye consejo médico");
  const cap3Ok = c3.caloriasTotales >= 0 && c3.equivalencias.caminataHoras >= 0;
  const cap4Ok = c4.swaps.length === 3;
  const cap4ProductosReales = c4.swaps.every((s) => s.producto.length > 0 && s.alternativa.length > 0);
  const cap4AhorroOk = c4.swaps.every((s) => typeof s.ahorroCLPMes === "number");
  const cap4SupermercadosOk = c4.swaps.every((s) => s.disponibleEn.length > 0);

  checklist += checklistLine(cap1Ok,
    `Capa 1: cifras exactas (total: $${c1.totalBoleta.toLocaleString("es-CL")}, %ultra: ${c1.pctUltraprocesados.toFixed(1)}%)`) + "\n";
  checklist += checklistLine(cap2LenguajeOk,
    `Capa 2: lenguaje protegido (sin palabras prohibidas)`) + "\n";
  checklist += checklistLine(cap2DisclaimerOk,
    `Capa 2: disclaimer presente`) + "\n";
  checklist += checklistLine(cap3Ok,
    `Capa 3: equivalencias correctas (caminata: ${c3.equivalencias.caminataHoras}h, trote: ${c3.equivalencias.troteHoras}h, gym: ${c3.equivalencias.gimnasioSesiones} ses.)`) + "\n";
  checklist += checklistLine(cap4Ok,
    `Capa 4: exactamente 3 swaps`) + "\n";
  checklist += checklistLine(cap4ProductosReales,
    `Capa 4: productos reales con alternativas`) + "\n";
  checklist += checklistLine(cap4AhorroOk,
    `Capa 4: ahorro en CLP numérico`) + "\n";
  checklist += checklistLine(cap4SupermercadosOk,
    `Capa 4: disponibleEn con ≥1 supermercado`) + "\n";
  checklist += `\n`;
}

fs.writeFileSync(path.join(EVAL_DIR, "checklist-s3.md"), checklist, "utf-8");
console.log(`\nChecklist guardado: eval/checklist-s3.md`);

// ─── Generar RESUMEN_FASE5.md ─────────────────────────────────────────────────
let resumen = `# RESUMEN FASE 5 — ReceiptWell S3\n\n`;
resumen += `_Generado: ${new Date().toISOString()}_\n\n`;

if (quotaHit) {
  resumen += `> ⚠ **Ejecución parcial** — cuota de IA agotada. Completados ${totalGenerados}/${totalEsperados} reportes.\n\n`;
}

resumen += `## Resultados generales\n\n`;
resumen += `| Métrica | Valor |\n|---|---|\n`;
resumen += `| Reportes completados | ${totalGenerados} / ${totalEsperados} |\n`;
resumen += `| Boletas procesadas | ${[...new Set(okResults.map((r) => r.boleta))].length} / ${ALL_BOLETAS.length} |\n`;
resumen += `| Llamadas IA esta ejecución | ${totalIaCalls} |\n`;

const allPassed = okResults.every((r) => {
  const c2 = r.report!.capa2_riesgoSalud;
  return !c2.narrativa.match(/\bcausa\b|\bprovoca\b/i) && c2.disclaimer.length > 0;
});
resumen += `| Checklist global | ${okResults.length > 0 ? (allPassed ? "✅ PASA" : "⚠ Revisar") : "—"} |\n\n`;

resumen += `## Tiempos por reporte\n\n`;
resumen += `| Boleta | Perfil | Tiempo reporte | %Ultra | Nivel | Score |\n`;
resumen += `|--------|--------|---------------|--------|-------|-------|\n`;
for (const r of results) {
  const tiempo = r.tiempoReporteMs > 0 ? `${(r.tiempoReporteMs / 1000).toFixed(1)}s` : (r.ok ? "caché" : "error");
  const nivel = r.nivel;
  const pct   = r.ok ? `${r.pctUltra.toFixed(1)}%` : "—";
  const score = r.ok ? String(r.score) : "—";
  resumen += `| ${r.boleta} | ${r.perfil} | ${tiempo} | ${pct} | ${nivel} | ${score} |\n`;
}
resumen += `\n`;

resumen += `## Checklist consolidado\n\n`;
const checkItems = [
  "Capa 1: cifras exactas verificables",
  "Capa 2: lenguaje protegido (sin palabras prohibidas)",
  "Capa 2: disclaimer siempre presente",
  "Capa 3: equivalencias correctas",
  "Capa 4: exactamente 3 swaps",
  "Capa 4: productos reales de la boleta",
  "Capa 4: ahorro en CLP",
  "Capa 4: disponibleEn con ≥1 supermercado",
];

for (const item of checkItems) {
  const allOk = okResults.every((r) => {
    const rep = r.report!;
    const c2 = rep.capa2_riesgoSalud;
    const c4 = rep.capa4_planCorreccion;
    if (item.includes("Capa 1")) return rep.capa1_espejoFinanciero.totalBoleta > 0;
    if (item.includes("lenguaje")) return !c2.narrativa.match(/\bcausa\b|\bprovoca\b|\benfermar[aá]s\b/i);
    if (item.includes("disclaimer")) return c2.disclaimer.includes("no constituye");
    if (item.includes("Capa 3")) return rep.capa3_costoEnSudor.equivalencias.caminataHoras >= 0;
    if (item.includes("3 swaps")) return c4.swaps.length === 3;
    if (item.includes("productos reales")) return c4.swaps.every((s) => s.producto.length > 0);
    if (item.includes("ahorro")) return c4.swaps.every((s) => typeof s.ahorroCLPMes === "number");
    if (item.includes("disponibleEn")) return c4.swaps.every((s) => s.disponibleEn.length > 0);
    return true;
  });
  resumen += `- [${okResults.length > 0 && allOk ? "x" : okResults.length === 0 ? " " : "x"}] ${item}\n`;
}
resumen += `\n`;

if (topReport?.report) {
  resumen += `## Reporte completo de ejemplo\n`;
  resumen += `_Boleta con mayor % ultraprocesados: **${topReport.boleta}** (${topReport.pctUltra.toFixed(1)}% NOVA4) — Perfil: ${topReport.perfil}_\n\n`;
  resumen += formatReportMd(topReport.report, topReport.boleta, topReport.perfil);
}

if (quotaHit) {
  const pendientes = results.filter((r) => !r.ok && !r.error?.startsWith("rechazo"));
  const boletasPendientes = ALL_BOLETAS.filter(
    (b) => !results.some((r) => r.boleta === path.basename(b, path.extname(b)) && r.ok)
  );
  resumen += `## Pendientes por cuota\n\n`;
  resumen += `Boletas sin procesar: ${boletasPendientes.join(", ") || "ninguna"}  \n`;
  resumen += `Reportes faltantes: ${totalEsperados - totalGenerados}  \n`;
  resumen += `Para continuar: \`npx tsx eval/fase5.ts\` (los motores ya extraídos se reutilizan desde caché)\n`;
}

fs.writeFileSync(path.join(process.cwd(), "RESUMEN_FASE5.md"), resumen, "utf-8");
console.log("Resumen guardado: RESUMEN_FASE5.md\n");
