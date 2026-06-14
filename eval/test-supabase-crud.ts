/**
 * Test de integración CRUD contra el emulador local de Supabase.
 * Requiere: supabase start corriendo y .env.local configurado.
 *
 * Flujo: auth → crear perfil → upload imagen → guardar motor_json →
 *        guardar reporte → leer boletas → getReceipt → getReports →
 *        updateProfile → getUser → cleanup (cascade)
 *
 * Uso: npx tsx eval/test-supabase-crud.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { supabase } from "../src/supabase/client.js";
import {
  createUser,
  getUser,
  updateProfile,
  createReceipt,
  getUserReceipts,
  saveReport,
} from "../src/supabase/users.js";
import {
  uploadReceiptImage,
  getReceipt,
  getReports,
} from "../src/supabase/receipts.js";

dotenv.config({ path: ".env.local" });
dotenv.config();

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

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

// ─── Datos de prueba ──────────────────────────────────────────────────────────

const TEST_EMAIL    = `crudtest_${Date.now()}@receiptwell.test`;
const TEST_PASSWORD = "Test1234!";

// JPEG mínimo válido de 1×1 pixel blanco
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
  0x09, 0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03,
  0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d,
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
  0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72,
  0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xfb, 0xd4,
  0x00, 0x00, 0x00, 0x1f, 0xff, 0xd9,
]);

// Motor JSON simplificado (estructura ResultadoOk reducida para el test)
const MOCK_MOTOR_JSON = {
  supermercado: "Lider",
  fecha: "2024-01-15",
  total: 12500,
  productos: [
    { nombre: "Leche Descremada 1L", nova: 1, precio: 990, cantidad: 2 },
    { nombre: "Galletas Oreo", nova: 4, precio: 1490, cantidad: 1 },
  ],
};

// Reporte JSON simplificado
const MOCK_REPORT_JSON = {
  version: "report-v1",
  boletaId: "test-uuid-1234",
  fecha: new Date().toISOString(),
  marcador: { score: 72, tendencia: "estable", ahorroAcumuladoCLP: 0 },
};

// ─── Admin client ─────────────────────────────────────────────────────────────

const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── Setup ────────────────────────────────────────────────────────────────────

console.log("\n=== Test CRUD — Supabase emulador local ===\n");

console.log("── Setup: auth ──");
const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});
if (signUpErr || !signUpData.user) {
  console.error("Error en signup:", signUpErr?.message);
  process.exit(1);
}
const userId = signUpData.user.id;
ok(`Usuario creado: ${userId}`);

const { error: loginErr } = await supabase.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});
if (loginErr) {
  console.error("Error en login:", loginErr.message);
  process.exit(1);
}
ok("Login exitoso — sesión activa");

// ─── 1. Crear perfil de usuario ───────────────────────────────────────────────
console.log("\n── 1. Crear perfil en public.users ──");
{
  const t0 = Date.now();
  let user = null;
  try {
    user = await createUser(userId, TEST_EMAIL);
    assert("createUser devuelve fila", !!user);
    assert("user.id correcto", user.id === userId);
    assert("user.email correcto", user.email === TEST_EMAIL);
    assert("objetivo default = equilibrio", user.objetivo === "equilibrio");
    ok(`latencia createUser: ${Date.now() - t0}ms`);
  } catch (e) {
    fail("createUser", String(e));
  }
}

// ─── 2. getUser ───────────────────────────────────────────────────────────────
console.log("\n── 2. getUser ──");
{
  const t0 = Date.now();
  const user = await getUser(userId);
  assert("getUser devuelve fila", user !== null);
  assert("getUser.id correcto", user?.id === userId);
  assert(`latencia <500ms`, Date.now() - t0 < 500, `${Date.now() - t0}ms`);
}

// ─── 3. updateProfile ────────────────────────────────────────────────────────
console.log("\n── 3. updateProfile ──");
{
  const t0 = Date.now();
  try {
    await updateProfile(userId, { nombre: "Usuario Test", objetivo: "salud", adultos: 2, ninos: 1 });
    ok("updateProfile sin error");
    const user = await getUser(userId);
    assert("nombre actualizado", user?.nombre === "Usuario Test");
    assert("objetivo actualizado", user?.objetivo === "salud");
    assert("adultos actualizado", user?.adultos === 2);
    assert("ninos actualizado", user?.ninos === 1);
    assert(`latencia <500ms`, Date.now() - t0 < 500, `${Date.now() - t0}ms`);
  } catch (e) {
    fail("updateProfile", String(e));
  }
}

// ─── 4. Upload imagen a storage ───────────────────────────────────────────────
console.log("\n── 4. uploadReceiptImage (storage) ──");
let storagePath = "";
{
  const t0 = Date.now();
  const fileName = `boleta_test_${Date.now()}.jpg`;
  try {
    const result = await uploadReceiptImage(userId, fileName, MINIMAL_JPEG);
    storagePath = result.path;
    assert("devuelve path", typeof result.path === "string" && result.path.length > 0);
    assert("path contiene userId", result.path.startsWith(userId));
    assert(`latencia <500ms`, Date.now() - t0 < 500, `${Date.now() - t0}ms`);
    ok(`path: ${storagePath}`);
  } catch (e) {
    fail("uploadReceiptImage", String(e));
    storagePath = `${userId}/boleta_fallback.jpg`;
  }
}

// ─── 5. Guardar motor_json en receipts ────────────────────────────────────────
console.log("\n── 5. createReceipt ──");
let receiptId = "";
{
  const t0 = Date.now();
  try {
    const receipt = await createReceipt(userId, storagePath, MOCK_MOTOR_JSON);
    receiptId = receipt.id;
    assert("devuelve receipt con id", typeof receipt.id === "string");
    assert("user_id correcto", receipt.user_id === userId);
    assert("imagen_path correcto", receipt.imagen_path === storagePath);
    assert("motor_json guardado", receipt.motor_json !== null);
    assert(`latencia <500ms`, Date.now() - t0 < 500, `${Date.now() - t0}ms`);
    ok(`receiptId: ${receiptId}`);
  } catch (e) {
    fail("createReceipt", String(e));
  }
}

// ─── 6. getReceipt ───────────────────────────────────────────────────────────
console.log("\n── 6. getReceipt ──");
{
  if (!receiptId) {
    fail("getReceipt (omitido, receiptId vacío)");
  } else {
    const t0 = Date.now();
    const receipt = await getReceipt(receiptId);
    assert("getReceipt devuelve fila", receipt !== null);
    assert("id correcto", receipt?.id === receiptId);
    assert(
      "motor_json contiene supermercado",
      (receipt?.motor_json as any)?.supermercado === "Lider"
    );
    assert(`latencia <500ms`, Date.now() - t0 < 500, `${Date.now() - t0}ms`);
  }
}

// ─── 7. Guardar reporte completo ──────────────────────────────────────────────
console.log("\n── 7. saveReport ──");
let reportId = "";
{
  if (!receiptId) {
    fail("saveReport (omitido, receiptId vacío)");
  } else {
    const t0 = Date.now();
    try {
      const report = await saveReport(userId, receiptId, MOCK_REPORT_JSON);
      reportId = report.id;
      assert("devuelve report con id", typeof report.id === "string");
      assert("receipt_id correcto", report.receipt_id === receiptId);
      assert("report_json guardado", report.report_json !== null);
      assert(
        "score en report_json",
        (report.report_json as any)?.marcador?.score === 72
      );
      assert(`latencia <500ms`, Date.now() - t0 < 500, `${Date.now() - t0}ms`);
      ok(`reportId: ${reportId}`);
    } catch (e) {
      fail("saveReport", String(e));
    }
  }
}

// ─── 8. getReports para el receipt ───────────────────────────────────────────
console.log("\n── 8. getReports (por receiptId) ──");
{
  if (!receiptId) {
    fail("getReports (omitido)");
  } else {
    const reports = await getReports(receiptId);
    assert("devuelve array", Array.isArray(reports));
    assert("contiene el reporte guardado", reports.length === 1, `got ${reports.length}`);
    assert("receipt_id correcto", reports[0]?.receipt_id === receiptId);
  }
}

// ─── 9. getUserReceipts ───────────────────────────────────────────────────────
console.log("\n── 9. getUserReceipts ──");
{
  const t0 = Date.now();
  const receipts = await getUserReceipts(userId);
  assert("devuelve array", Array.isArray(receipts));
  assert("contiene la boleta guardada", receipts.length === 1, `got ${receipts.length}`);
  assert("id coincide", receipts[0]?.id === receiptId);
  assert(`latencia <500ms`, Date.now() - t0 < 500, `${Date.now() - t0}ms`);
}

// ─── 10. getUserReceipts con limit ────────────────────────────────────────────
console.log("\n── 10. getUserReceipts con limit=5 (2ª boleta) ──");
{
  // Crear segunda boleta para probar limit y orden
  const r2 = await createReceipt(userId, `${userId}/boleta2.jpg`, { supermercado: "Jumbo" });
  const receipts = await getUserReceipts(userId, 5);
  assert("devuelve 2 boletas", receipts.length === 2, `got ${receipts.length}`);
  assert("orden DESC: la más nueva primero", receipts[0]?.id === r2.id);
}

// ─── 11. getUser devuelve null para id inexistente ────────────────────────────
console.log("\n── 11. getUser con id inexistente ──");
{
  const user = await getUser("00000000-0000-0000-0000-000000000000");
  assert("devuelve null para id inexistente", user === null);
}

// ─── 12. getReceipt devuelve null para id inexistente ─────────────────────────
console.log("\n── 12. getReceipt con id inexistente ──");
{
  const receipt = await getReceipt("00000000-0000-0000-0000-000000000000");
  assert("devuelve null para id inexistente", receipt === null);
}

// ─── Limpieza ─────────────────────────────────────────────────────────────────
console.log("\n── Limpieza ──");
{
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) fail(`eliminar usuario: ${error.message}`);
  else ok("usuario eliminado — cascade borra receipts, reports y score_history");

  // Verificar que cascade funcionó: getUserReceipts debería devolver 0
  // (nota: RLS ya no permite leer con la sesión del usuario eliminado,
  //  pero el admin puede verificar directamente)
  const { data: orphans } = await admin
    .from("receipts")
    .select("id")
    .eq("user_id", userId);
  assert(
    "cascade: 0 receipts huérfanos tras deleteUser",
    (orphans ?? []).length === 0,
    `got ${(orphans ?? []).length}`
  );
}

// ─── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(48)}`);
console.log(`Resultado: ${passed} pasaron · ${failed} fallaron`);
if (failed > 0) {
  console.error("\n⚠  Hay tests fallidos.");
  process.exit(1);
} else {
  console.log("\n✓  Todos los tests de CRUD pasaron.");
}
