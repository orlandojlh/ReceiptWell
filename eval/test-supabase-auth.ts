/**
 * Test de auth contra el emulador local de Supabase.
 * Requiere: supabase start corriendo y .env.local con credenciales.
 *
 * Uso: npx tsx eval/test-supabase-auth.ts
 */
import { signup, login, getCurrentUser, logout, getSession } from "../src/supabase/auth.js";
import { supabase } from "../src/supabase/client.js";

let passed = 0;
let failed = 0;

function ok(label: string): void {
  console.log(`  ✓  ${label}`);
  passed++;
}

function fail(label: string, detail?: string): void {
  console.error(`  ✗  ${label}`);
  if (detail) console.error(`     ${detail}`);
  failed++;
}

function assert(label: string, condition: boolean, detail?: string): void {
  condition ? ok(label) : fail(label, detail);
}

// Email único por ejecución para no colisionar con corridas anteriores
const TEST_EMAIL    = `test_${Date.now()}@receiptwell.test`;
const TEST_PASSWORD = "Test1234!";

console.log("\n=== Test de Auth — Supabase emulador local ===\n");
console.log(`  Email de prueba: ${TEST_EMAIL}\n`);

// ── 1. Sin sesión inicial ────────────────────────────────────────────────────
console.log("── 1. Estado inicial ──");
{
  const user = await getCurrentUser();
  assert("Sin usuario activo al inicio", user === null);
  const session = await getSession();
  assert("Sin sesión activa al inicio", session === null);
}

// ── 2. Registro ──────────────────────────────────────────────────────────────
console.log("\n── 2. Registro (signup) ──");
let userId: string | null = null;
{
  try {
    const user = await signup(TEST_EMAIL, TEST_PASSWORD);
    assert("signup devuelve un user", !!user);
    assert("user tiene id", typeof user.id === "string" && user.id.length > 0);
    assert("user.email coincide", user.email === TEST_EMAIL);
    userId = user.id;
    ok(`  user.id = ${user.id}`);
  } catch (err) {
    fail("signup no debería lanzar error", String(err));
  }
}

// ── 3. Login ─────────────────────────────────────────────────────────────────
console.log("\n── 3. Login (email + password) ──");
{
  try {
    const user = await login(TEST_EMAIL, TEST_PASSWORD);
    assert("login devuelve un user", !!user);
    assert("user.id coincide con el registrado", user.id === userId);

    const session = await getSession();
    assert("sesión activa tras login", session !== null);
    assert("session.access_token presente", typeof session?.access_token === "string");
  } catch (err) {
    fail("login no debería lanzar error", String(err));
  }
}

// ── 4. getCurrentUser con sesión activa ──────────────────────────────────────
console.log("\n── 4. getCurrentUser ──");
{
  const user = await getCurrentUser();
  assert("getCurrentUser devuelve user", user !== null);
  assert("getCurrentUser.email correcto", user?.email === TEST_EMAIL);
  assert("getCurrentUser.id correcto", user?.id === userId);
}

// ── 5. Credenciales incorrectas ───────────────────────────────────────────────
console.log("\n── 5. Login con contraseña incorrecta ──");
{
  try {
    await login(TEST_EMAIL, "contraseña_incorrecta");
    fail("debería haber lanzado error con contraseña incorrecta");
  } catch (err) {
    assert("lanza error con contraseña incorrecta", true);
    ok(`  Error esperado: ${String(err).slice(0, 60)}`);
  }
}

// ── 6. Logout ────────────────────────────────────────────────────────────────
console.log("\n── 6. Logout ──");
{
  try {
    await logout();
    ok("logout ejecutado sin error");
    const user = await getCurrentUser();
    assert("getCurrentUser devuelve null tras logout", user === null);
    const session = await getSession();
    assert("sin sesión tras logout", session === null);
  } catch (err) {
    fail("logout no debería lanzar error", String(err));
  }
}

// ── 7. Limpieza — eliminar usuario de prueba via service_role ────────────────
console.log("\n── 7. Limpieza ──");
{
  if (userId) {
    try {
      // Necesita service_role key para admin operations
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceKey) {
        const { createClient } = await import("@supabase/supabase-js");
        const admin = createClient(
          process.env.SUPABASE_URL!,
          serviceKey,
          { auth: { autoRefreshToken: false, persistSession: false } }
        );
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) {
          fail(`eliminar usuario de prueba: ${error.message}`);
        } else {
          ok(`usuario de prueba eliminado (id: ${userId})`);
        }
      } else {
        ok("SUPABASE_SERVICE_ROLE_KEY no configurada — limpieza manual necesaria");
      }
    } catch (err) {
      fail("limpieza", String(err));
    }
  }
}

// ─── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(45)}`);
console.log(`Resultado: ${passed} pasaron · ${failed} fallaron`);
if (failed > 0) {
  console.error("\n⚠  Hay tests fallidos.");
  process.exit(1);
} else {
  console.log("\n✓  Todos los tests de auth pasaron.");
}
