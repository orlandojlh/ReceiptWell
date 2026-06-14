/**
 * Test e2e de integración Supabase — sin llamadas a la IA.
 *
 * Simula el flujo completo del CLI con --user-id:
 *   auth → perfil → upload imagen → createReceipt (motor cacheado) →
 *   buildReport determinístico (calc + fallback, sin Gemini) →
 *   SupabaseHistoryStore → saveReport → verificar tablas → logout → cleanup.
 *
 * Motor: data/motores/PRUEBA3.json (el de mayor % ultraprocesados).
 * No se llama a analyzeReceipt ni a runGuard — todo determinístico.
 *
 * Uso: npx tsx eval/test-e2e-supabase.ts
 */
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config();

// ── Imports del dominio ───────────────────────────────────────────────────────
import { supabase } from "../src/supabase/client.js";
import { createUser, createReceipt, getUserReceipts, saveReport } from "../src/supabase/users.js";
import { uploadReceiptImage, getReceipt, getReports } from "../src/supabase/receipts.js";
import { createSupabaseHistoryStore } from "../src/report/history.js";
import { calcCapa1, calcCapa3 } from "../src/report/calc.js";
import { calcRiesgo } from "../src/report/risk.js";
import { calcScore, calcTendencia } from "../src/report/score.js";
import { FALLBACK_SWAPS } from "../src/report/fallback-swaps.js";
import { NARRATIVA_FALLBACK_TEST, DISCLAIMER } from "../src/report/guard.js";
import { ReportSchema, HouseholdProfileSchema } from "../src/report/schema.js";
import type { ResultadoOk } from "../src/engine/schema.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const timings: Record<string, number> = {};

function ok(label: string, detail?: string): void {
  console.log(`  ✓  ${label}${detail ? `  (${detail})` : ""}`);
  passed++;
}
function fail(label: string, detail?: string): void {
  console.error(`  ✗  ${label}${detail ? `\n     ${detail}` : ""}`);
  failed++;
}
function assert(label: string, condition: boolean, detail?: string): void {
  condition ? ok(label, detail) : fail(label, detail);
}
function t(label: string, ms: number): void {
  timings[label] = ms;
  assert(`latencia <500ms [${label}]`, ms < 500, `${ms}ms`);
}

// ─── Motor cacheado ───────────────────────────────────────────────────────────

const MOTOR_PATH = path.join(process.cwd(), "data", "motores", "PRUEBA3.json");
if (!fs.existsSync(MOTOR_PATH)) {
  console.error(`Motor cacheado no encontrado: ${MOTOR_PATH}`);
  console.error("Asegúrate de que data/motores/PRUEBA3.json existe.");
  process.exit(1);
}
const MOTOR = JSON.parse(fs.readFileSync(MOTOR_PATH, "utf-8")) as ResultadoOk;

// ─── Perfil de prueba ─────────────────────────────────────────────────────────

const PROFILE = HouseholdProfileSchema.parse({
  adultos: 2,
  ninos: 1,
  objetivo: "salud",
  condiciones: [],
});

// ─── Imagen mínima JPEG (1×1 px) ─────────────────────────────────────────────

const MINIMAL_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
  0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
  0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
  0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
  0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
  0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xfb, 0xd4, 0x00, 0x00, 0x00, 0x1f, 0xff, 0xd9,
]);

// ─── Constructor de reporte determinístico (sin IA) ───────────────────────────

async function buildReportNoAI(
  motor: ResultadoOk,
  history: Awaited<ReturnType<typeof createSupabaseHistoryStore>>
) {
  const capa1 = calcCapa1(motor);
  const capa3 = calcCapa3(motor);
  const { nivel, factores } = calcRiesgo(capa1.pctUltraprocesados, PROFILE);

  const historialReciente = await history.recent(3);
  const ultimosScores = historialReciente.map((e) => e.score);
  const score = calcScore(capa1.pctUltraprocesados, nivel, PROFILE, motor);
  const tendencia = calcTendencia(score, ultimosScores);
  const ahorroAcumuladoCLP = await history.totalAhorro();

  // Persistir en historial
  await history.append({
    fecha: new Date().toISOString(),
    score,
    ahorroAceptadoCLP: 0,
  });

  // Construir reporte con fallback narrativa/swaps (sin llamar a Gemini)
  const raw = {
    version: "report-v1" as const,
    boletaId: crypto.randomUUID(),
    fecha: new Date().toISOString(),
    capa1_espejoFinanciero: capa1,
    capa2_riesgoSalud: {
      nivel,
      factores,
      narrativa: NARRATIVA_FALLBACK_TEST[nivel],
      disclaimer: DISCLAIMER,
    },
    capa3_costoEnSudor: capa3,
    capa4_planCorreccion: { swaps: FALLBACK_SWAPS },
    marcador: { ahorroAcumuladoCLP, score, tendencia },
  };

  return ReportSchema.parse(raw);
}

// ─── Admin client ─────────────────────────────────────────────────────────────

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ═══════════════════════════════════════════════════════════════════════════════
console.log("\n=== Test E2E — Supabase emulador local (sin IA) ===\n");
console.log(`Motor: PRUEBA3.json (${MOTOR.productos.length} productos)\n`);

// ─── 1. Auth ──────────────────────────────────────────────────────────────────
console.log("── 1. Auth: signup + login ──");

const TEST_EMAIL    = `e2e_${Date.now()}@receiptwell.test`;
const TEST_PASSWORD = "Test1234!";

const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});
if (signUpErr || !signUpData.user) {
  console.error("Signup falló:", signUpErr?.message);
  process.exit(1);
}
const userId = signUpData.user.id;
ok(`Signup OK — userId: ${userId}`);

const { error: loginErr } = await supabase.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});
if (loginErr) {
  console.error("Login falló:", loginErr.message);
  process.exit(1);
}
ok("Login OK — sesión activa");

// ─── 2. Crear perfil ──────────────────────────────────────────────────────────
console.log("\n── 2. Perfil de usuario ──");
{
  const t0 = Date.now();
  const user = await createUser(userId, TEST_EMAIL);
  assert("createUser devuelve fila", !!user);
  assert("email correcto", user.email === TEST_EMAIL);
  t("createUser", Date.now() - t0);
}

// ─── 3. Upload imagen ─────────────────────────────────────────────────────────
console.log("\n── 3. Upload imagen (storage) ──");
let storagePath = "";
{
  const t0 = Date.now();
  const { path: sp } = await uploadReceiptImage(userId, `e2e_${Date.now()}.jpg`, MINIMAL_JPEG);
  storagePath = sp;
  assert("path devuelto", typeof sp === "string" && sp.length > 0);
  assert("path contiene userId", sp.startsWith(userId));
  t("uploadImage", Date.now() - t0);
  ok(`path: ${storagePath}`);
}

// ─── 4. Guardar motor_json en receipts ────────────────────────────────────────
console.log("\n── 4. createReceipt (motor cacheado) ──");
let receiptId = "";
{
  const t0 = Date.now();
  const receipt = await createReceipt(userId, storagePath, MOTOR);
  receiptId = receipt.id;
  assert("receipt.id presente", typeof receiptId === "string");
  assert("user_id correcto", receipt.user_id === userId);
  assert("motor_json supermercado", (receipt.motor_json as any)?.supermercado === "Lider");
  assert(
    "motor_json productos count",
    (receipt.motor_json as any)?.productos?.length === MOTOR.productos.length,
    `got ${(receipt.motor_json as any)?.productos?.length}`
  );
  t("createReceipt", Date.now() - t0);
  ok(`receiptId: ${receiptId}`);
}

// ─── 5. Construir reporte determinístico + HistoryStore Supabase ──────────────
console.log("\n── 5. buildReportNoAI + SupabaseHistoryStore ──");
let report: ReturnType<typeof ReportSchema.parse> | null = null;
{
  const t0 = Date.now();
  const history = await createSupabaseHistoryStore(userId);
  report = await buildReportNoAI(MOTOR, history);

  assert("report.version = report-v1", report.version === "report-v1");
  assert("boletaId presente", typeof report.boletaId === "string");
  assert("score 0-100", report.marcador.score >= 0 && report.marcador.score <= 100,
    `score=${report.marcador.score}`);
  assert("tendencia primera_boleta", report.marcador.tendencia === "primera_boleta");
  assert("3 swaps", report.capa4_planCorreccion.swaps.length === 3);
  assert("nivel riesgo válido", ["bajo", "moderado", "alto"].includes(report.capa2_riesgoSalud.nivel));
  assert("narrativa no vacía", report.capa2_riesgoSalud.narrativa.length > 10);
  assert("capa1 totalBoleta > 0", report.capa1_espejoFinanciero.totalBoleta > 0);
  assert("capa3 caloriasTotales >= 0", report.capa3_costoEnSudor.caloriasTotales >= 0);
  t("buildReport+history", Date.now() - t0);

  ok(`score=${report.marcador.score}  nivel=${report.capa2_riesgoSalud.nivel}  pct=${report.capa1_espejoFinanciero.pctUltraprocesados}%`);
}

// ─── 6. Verificar score_history se escribió ───────────────────────────────────
console.log("\n── 6. Verificar score_history ──");
{
  const history = await createSupabaseHistoryStore(userId);
  const recientes = await history.recent(5);
  assert("1 entrada en score_history", recientes.length === 1, `got ${recientes.length}`);
  assert("score coincide con reporte",
    recientes[0]?.score === report!.marcador.score,
    `got ${recientes[0]?.score}`
  );
  assert("fecha presente", typeof recientes[0]?.fecha === "string");
}

// ─── 7. Guardar reporte en reports ────────────────────────────────────────────
console.log("\n── 7. saveReport ──");
let reportId = "";
{
  const t0 = Date.now();
  const saved = await saveReport(userId, receiptId, report!);
  reportId = saved.id;
  assert("report.id presente", typeof reportId === "string");
  assert("receipt_id correcto", saved.receipt_id === receiptId);
  assert("score en report_json",
    (saved.report_json as any)?.marcador?.score === report!.marcador.score
  );
  t("saveReport", Date.now() - t0);
  ok(`reportId: ${reportId}`);
}

// ─── 8. Leer boletas del usuario ──────────────────────────────────────────────
console.log("\n── 8. getUserReceipts ──");
{
  const t0 = Date.now();
  const receipts = await getUserReceipts(userId);
  assert("1 boleta para el usuario", receipts.length === 1, `got ${receipts.length}`);
  assert("id coincide", receipts[0]?.id === receiptId);
  t("getUserReceipts", Date.now() - t0);
}

// ─── 9. getReceipt individual ─────────────────────────────────────────────────
console.log("\n── 9. getReceipt ──");
{
  const t0 = Date.now();
  const r = await getReceipt(receiptId);
  assert("receipt encontrado", r !== null);
  assert("id correcto", r?.id === receiptId);
  assert("motor_json intacto",
    (r?.motor_json as any)?.productos?.length === MOTOR.productos.length
  );
  t("getReceipt", Date.now() - t0);
}

// ─── 10. getReports para el receipt ──────────────────────────────────────────
console.log("\n── 10. getReports ──");
{
  const t0 = Date.now();
  const reports = await getReports(receiptId);
  assert("1 reporte para la boleta", reports.length === 1, `got ${reports.length}`);
  assert("report_json score correcto",
    (reports[0]?.report_json as any)?.marcador?.score === report!.marcador.score
  );
  t("getReports", Date.now() - t0);
}

// ─── 11. Logout ───────────────────────────────────────────────────────────────
console.log("\n── 11. Logout ──");
{
  const { error } = await supabase.auth.signOut();
  assert("logout sin error", !error, error?.message);
  const { data: { session } } = await supabase.auth.getSession();
  assert("sin sesión tras logout", session === null);
}

// ─── 12. Cleanup (cascade) ────────────────────────────────────────────────────
console.log("\n── 12. Cleanup ──");
{
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) fail(`deleteUser: ${error.message}`);
  else ok("usuario eliminado — cascade limpia todas las tablas");

  // Verificar cascade via admin
  const { data: orphanReceipts } = await admin
    .from("receipts")
    .select("id")
    .eq("user_id", userId);
  const { data: orphanHistory } = await admin
    .from("score_history")
    .select("id")
    .eq("user_id", userId);

  assert("cascade receipts: 0 huérfanos",
    (orphanReceipts ?? []).length === 0,
    `got ${(orphanReceipts ?? []).length}`
  );
  assert("cascade score_history: 0 huérfanos",
    (orphanHistory ?? []).length === 0,
    `got ${(orphanHistory ?? []).length}`
  );
}

// ─── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(52)}`);
console.log("Latencias:");
for (const [op, ms] of Object.entries(timings)) {
  console.log(`  ${op.padEnd(26)} ${ms}ms`);
}
console.log(`\nResultado: ${passed} pasaron · ${failed} fallaron`);
if (failed > 0) {
  console.error("\n⚠  Hay tests fallidos.");
  process.exit(1);
} else {
  console.log("\n✓  Todos los tests e2e pasaron (sin llamadas a la IA).");
}
