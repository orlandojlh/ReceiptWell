/**
 * Test de rate limit — POST /api/analizar
 *
 * Precondición: Next.js dev server corriendo en http://localhost:3000
 *   cd web && npm run dev
 *
 * Lo que hace:
 *  1. Crea un usuario de prueba en el emulador de Supabase
 *  2. Inserta 3 receipts con procesado_ia=true via service role (sin llamar a la IA)
 *  3. Hace POST a /api/analizar con una imagen nueva
 *  4. Verifica que la respuesta sea 429 con el mensaje de límite alcanzado
 *  5. Limpia el usuario de prueba
 *
 * Uso: npx tsx eval/test-rate-limit.ts
 */
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: "web/.env.local" });
dotenv.config({ path: ".env.local" });
dotenv.config();

// ─── Configuración ────────────────────────────────────────────────────────────

const SUPABASE_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const NEXT_URL            = "http://localhost:3000";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error("Faltan variables de entorno. Revisa web/.env.local");
  process.exit(1);
}

// Cliente de usuario (anon) y cliente de administrador (service role)
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Helpers de test ──────────────────────────────────────────────────────────

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

// ─── Imagen JPEG mínima (1×1 px) ─────────────────────────────────────────────

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

// ─── Codificación de sesión para cookie de @supabase/ssr ─────────────────────
//
// @supabase/ssr almacena la sesión en la cookie "sb-{hostname[0]}-auth-token"
// con el valor: "base64-" + base64url(JSON.stringify(session))
// El hostname de http://127.0.0.1:54321 → split(".")[0] → "127"

function sessionToCookie(session: object): { name: string; value: string } {
  const hostname = new URL(SUPABASE_URL).hostname.split(".")[0];
  const name  = `sb-${hostname}-auth-token`;
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  return { name, value };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("\n=== Test Rate Limit — POST /api/analizar ===\n");

// Verificar que el servidor Next.js esté corriendo
console.log("── 0. Verificar servidor Next.js ──");
try {
  const ping = await fetch(`${NEXT_URL}/api/analizar`, { method: "GET" });
  // Esperamos 405 (method not allowed) o cualquier respuesta, no un error de red
  assert(
    "Next.js server responde",
    ping.status !== 0,
    `status ${ping.status}`
  );
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n⛔  No se puede conectar a ${NEXT_URL}`);
  console.error(`   Inicia el servidor: cd web && npm run dev\n`);
  console.error(`   Error: ${msg}\n`);
  process.exit(1);
}

// ── 1. Crear usuario de prueba ────────────────────────────────────────────────
console.log("\n── 1. Crear usuario de prueba ──");

const TEST_EMAIL    = `ratelimit_${Date.now()}@receiptwell.test`;
const TEST_PASSWORD = "Test1234!";
let userId = "";

{
  const { data, error } = await anon.auth.signUp({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error || !data.user) {
    console.error("Signup falló:", error?.message);
    process.exit(1);
  }
  userId = data.user.id;
  ok(`Signup OK — userId: ${userId}`);
}

// Login para obtener la sesión
const { data: loginData, error: loginErr } = await anon.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});
if (loginErr || !loginData.session) {
  console.error("Login falló:", loginErr?.message);
  process.exit(1);
}
const session = loginData.session;
ok(`Login OK — token: ${session.access_token.slice(0, 20)}...`);

// ── 2. Insertar 3 receipts con procesado_ia=true ──────────────────────────────
// Usamos el cliente anon autenticado (mismo patrón que test-e2e-supabase.ts):
// el INSERT policy permite auth.uid() = user_id, y el usuario ya está logueado.
console.log("\n── 2. Insertar 3 fake receipts (procesado_ia=true) ──");

const unaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();

for (let i = 1; i <= 3; i++) {
  const { data: receipt, error } = await anon
    .from("receipts")
    .insert({
      user_id:       userId,
      imagen_path:   `${userId}/fake_receipt_${i}.jpg`,
      imagen_hash:   `fakehash${i}${"0".repeat(59 - i)}`,
      procesado_ia:  true,
      motor_json:    { fake: true, index: i },
      created_at:    new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    fail(`Insertar receipt ${i}`, error.message);
  } else {
    ok(`Receipt ${i} insertado`, `id: ${receipt.id}`);
  }
}

// Verificar que la ventana temporal los incluye (deben ser created_at recientes)
const { count } = await anon
  .from("receipts")
  .select("id", { count: "exact", head: true })
  .eq("user_id", userId)
  .eq("procesado_ia", true)
  .gte("created_at", unaHoraAtras);

assert(
  "3 receipts procesados en la última hora",
  (count ?? 0) >= 3,
  `count=${count}`
);

// ── 3. POST a /api/analizar → debe devolver 429 ────────────────────────────────
console.log("\n── 3. POST /api/analizar con imagen nueva → espera 429 ──");

const { name: cookieName, value: cookieValue } = sessionToCookie(session);
ok(`Cookie construida`, `${cookieName}=base64-...`);

// Armar multipart form con una imagen nueva (hash diferente a los fake)
const form = new FormData();
form.append(
  "imagen",
  new Blob([MINIMAL_JPEG], { type: "image/jpeg" }),
  "nueva_boleta.jpg"
);

let res: Response;
try {
  res = await fetch(`${NEXT_URL}/api/analizar`, {
    method:  "POST",
    headers: { Cookie: `${cookieName}=${cookieValue}` },
    body:    form,
  });
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  fail("Fetch a /api/analizar", msg);
  process.exit(1);
}

const body = await res.json() as { error?: string; retry_after_minutes?: number };

console.log(`\n  Status recibido: ${res.status}`);
console.log(`  Body: ${JSON.stringify(body)}`);

assert("Status es 429",              res.status === 429);
assert("Body tiene campo error",     typeof body.error === "string");
assert(
  "Mensaje menciona límite / análisis",
  typeof body.error === "string" && (
    body.error.toLowerCase().includes("análisis") ||
    body.error.toLowerCase().includes("limite") ||
    body.error.toLowerCase().includes("límite") ||
    body.error.toLowerCase().includes("tiempo")
  ),
  body.error
);
assert(
  "Body tiene retry_after_minutes",
  typeof body.retry_after_minutes === "number",
  `retry_after_minutes=${body.retry_after_minutes}`
);

// ── 4. Cleanup ────────────────────────────────────────────────────────────────
console.log("\n── 4. Cleanup ──");
{
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) fail(`deleteUser: ${error.message}`);
  else ok("Usuario y datos eliminados (cascade)");
}

// ─── Resumen ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(52)}`);
console.log(`Resultado: ${passed} pasaron · ${failed} fallaron`);

if (failed > 0) {
  console.error("\n⚠  Hay tests fallidos.");
  process.exit(1);
} else {
  console.log("\n✓  Rate limit verificado correctamente — 429 recibido.\n");
}
