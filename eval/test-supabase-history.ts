/**
 * Test del SupabaseHistoryStore contra el emulador local.
 * Requiere: supabase start corriendo y .env.local configurado.
 *
 * Crea un usuario temporal, apenda 5 scores, lee los últimos 3,
 * verifica orden y valores, verifica totalAhorro, limpia.
 *
 * Uso: npx tsx eval/test-supabase-history.ts
 */
import { createSupabaseHistoryStore } from "../src/report/history.js";
import { supabase } from "../src/supabase/client.js";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

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

// ─── Setup: usuario de prueba vía service_role ────────────────────────────────

const TEST_EMAIL    = `histtest_${Date.now()}@receiptwell.test`;
const TEST_PASSWORD = "Test1234!";

console.log("\n=== Test SupabaseHistoryStore — emulador local ===\n");

// Admin client para crear y limpiar usuario de prueba
const admin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Registrar y loguear el usuario de prueba para tener una sesión activa
console.log("── Setup: crear usuario de prueba ──");
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

// Login para obtener sesión (necesaria para que RLS permita INSERT)
const { error: loginErr } = await supabase.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});
if (loginErr) {
  console.error("Error en login:", loginErr.message);
  process.exit(1);
}
ok("Login exitoso — sesión activa");

// ─── Crear store ──────────────────────────────────────────────────────────────
const store = await createSupabaseHistoryStore(userId);

// ─── Test 1: append 5 scores ──────────────────────────────────────────────────
console.log("\n── 1. Append 5 scores ──");

const SCORES = [60, 72, 68, 85, 91];
const AHORROS = [0, 500, 0, 1200, 300];

for (let i = 0; i < SCORES.length; i++) {
  try {
    await store.append({
      fecha: new Date(Date.now() + i * 1000).toISOString(), // fechas distintas
      score: SCORES[i],
      ahorroAceptadoCLP: AHORROS[i],
    });
    ok(`append score=${SCORES[i]}, ahorro=${AHORROS[i]}`);
  } catch (err) {
    fail(`append #${i + 1}`, String(err));
  }
}

// ─── Test 2: recent(3) — orden y valores ──────────────────────────────────────
console.log("\n── 2. recent(3) — últimos 3 en orden descendente de created_at ──");
{
  const recientes = await store.recent(3);
  assert("devuelve exactamente 3 entradas", recientes.length === 3,
    `got ${recientes.length}`);

  // El store ordena por created_at DESC → los últimos insertados primero
  // SCORES insertados: 60,72,68,85,91 → últimos 3: 91,85,68
  const scores = recientes.map((e) => e.score);
  assert("primer resultado es el más reciente (score 91)", scores[0] === 91,
    `got ${scores[0]}`);
  assert("segundo resultado score 85", scores[1] === 85,
    `got ${scores[1]}`);
  assert("tercer resultado score 68", scores[2] === 68,
    `got ${scores[2]}`);

  // Verificar que los campos se mapean correctamente
  assert("campo fecha presente", typeof recientes[0].fecha === "string");
  assert("campo score es número", typeof recientes[0].score === "number");
  assert("campo ahorroAceptadoCLP es número",
    typeof recientes[0].ahorroAceptadoCLP === "number");
}

// ─── Test 3: recent(n > total) — no falla si n > registros ───────────────────
console.log("\n── 3. recent(10) con solo 5 registros ──");
{
  const todos = await store.recent(10);
  assert("devuelve los 5 existentes (no falla)", todos.length === 5,
    `got ${todos.length}`);
}

// ─── Test 4: totalAhorro ──────────────────────────────────────────────────────
console.log("\n── 4. totalAhorro ──");
{
  const total = await store.totalAhorro();
  const esperado = AHORROS.reduce((s, a) => s + a, 0); // 0+500+0+1200+300 = 2000
  assert(`totalAhorro = ${esperado} CLP`, total === esperado,
    `got ${total}`);
}

// ─── Test 5: aislamiento — otro userId no ve los registros ───────────────────
console.log("\n── 5. Aislamiento por userId ──");
{
  // Crear un segundo usuario
  const { data: u2Data, error: u2Err } = await supabase.auth.signUp({
    email: `histtest2_${Date.now()}@receiptwell.test`,
    password: TEST_PASSWORD,
  });
  if (u2Err || !u2Data.user) {
    fail("no se pudo crear usuario 2 para test de aislamiento", u2Err?.message);
  } else {
    const store2 = await createSupabaseHistoryStore(u2Data.user.id);
    // Login como usuario 2
    await supabase.auth.signInWithPassword({
      email: `histtest2_${Date.now() - 1}@receiptwell.test`,
      password: TEST_PASSWORD,
    });
    // El store2 no debería ver los registros del usuario 1
    // (RLS filtra por user_id, pero estamos usando el mismo cliente con sesión de u1)
    // Para probar RLS real haría falta un cliente separado; aquí verificamos
    // que recent con userId distinto devuelve 0 registros vía la query .eq("user_id")
    const recientes2 = await store2.recent(10);
    assert("store de usuario 2 devuelve 0 registros (aislamiento)", recientes2.length === 0,
      `got ${recientes2.length}`);

    // Cleanup usuario 2
    await admin.auth.admin.deleteUser(u2Data.user.id);
    ok("usuario 2 de prueba eliminado");

    // Restaurar sesión del usuario 1 para que los tests siguientes pasen RLS
    await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
    ok("sesión restaurada a usuario 1");
  }
}

// ─── Test 6: append después de recent — tendencia funciona ───────────────────
console.log("\n── 6. Flujo completo: recent → calcular tendencia → append ──");
{
  const recientes = await store.recent(3);
  const ultimos3Scores = recientes.map((e) => e.score); // [91, 85, 68]
  const promedio = ultimos3Scores.reduce((s, v) => s + v, 0) / ultimos3Scores.length;
  const nuevoScore = 95;
  const diff = nuevoScore - promedio;

  assert("promedio últimos 3 calculado correctamente",
    Math.abs(promedio - (91 + 85 + 68) / 3) < 0.01,
    `promedio=${promedio.toFixed(1)}`);
  assert("diff > 3 → tendencia mejorando", diff > 3,
    `diff=${diff.toFixed(1)}`);

  await store.append({ fecha: new Date().toISOString(), score: nuevoScore, ahorroAceptadoCLP: 0 });
  const tras = await store.recent(1);
  assert("después de append, recent(1) devuelve el nuevo score",
    tras[0]?.score === nuevoScore, `got ${tras[0]?.score}`);
}

// ─── Limpieza ─────────────────────────────────────────────────────────────────
console.log("\n── Limpieza ──");
{
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) fail(`eliminar usuario de prueba: ${error.message}`);
  else ok(`usuario de prueba eliminado (cascade borra score_history)`);
}

// ─── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(48)}`);
console.log(`Resultado: ${passed} pasaron · ${failed} fallaron`);
if (failed > 0) {
  console.error("\n⚠  Hay tests fallidos.");
  process.exit(1);
} else {
  console.log("\n✓  Todos los tests de SupabaseHistoryStore pasaron.");
}
