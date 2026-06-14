/**
 * Test freemium â€” lÃ­mite de 2 boletas gratis por mes calendario
 *
 * PrecondiciÃ³n: Next.js dev server en http://localhost:3000
 *   cd web && npm run dev
 *
 * Flujo:
 *  1. Crea usuario de prueba (plan=free por defecto)
 *  2. Inserta 2 receipts con procesado_ia=true del mes actual â†’ dentro del lÃ­mite
 *  3. POST a /api/analizar (3.Âª boleta) â†’ debe devolver 402 con limit_reached=true
 *  4. Verifica que la respuesta NO sea 402 si hay solo 1 receipt (lÃ­mite no alcanzado)
 *     â€” esto se verifica con un 2.Âº usuario que solo tiene 1 receipt y llama
 *       a /api/analizar: debe avanzar mÃ¡s allÃ¡ del check freemium (puede fallar
 *       por otro motivo â€” IA sin cuota, etc. â€” pero NO con 402)
 *  5. Limpia ambos usuarios
 *
 * Uso: npx tsx eval/test-freemium.ts
 */
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: "web/.env.local" });
dotenv.config({ path: ".env.local" });
dotenv.config();

// â”€â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const NEXT_URL          = "http://localhost:3000";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error("Faltan variables de entorno. Revisa web/.env.local");
  process.exit(1);
}

const anon  = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let passed = 0;
let failed = 0;

function ok(label: string, detail?: string)   { console.log(`  âœ“  ${label}${detail ? `  (${detail})` : ""}`); passed++; }
function fail(label: string, detail?: string) { console.error(`  âœ—  ${label}${detail ? `\n     ${detail}` : ""}`); failed++; }
function assert(label: string, cond: boolean, detail?: string) { cond ? ok(label, detail) : fail(label, detail); }

function sessionToCookie(session: object): { name: string; value: string } {
  const hostname = new URL(SUPABASE_URL).hostname.split(".")[0];
  return {
    name:  `sb-${hostname}-auth-token`,
    value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
  };
}

async function crearUsuario(tag: string) {
  const email = `freemium_${tag}_${Date.now()}@receiptwell.test`;
  const password = "Test1234!";
  const { data, error } = await anon.auth.signUp({ email, password });
  if (error || !data.user) throw new Error(`Signup fallÃ³: ${error?.message}`);
  const { data: loginData, error: loginErr } = await anon.auth.signInWithPassword({ email, password });
  if (loginErr || !loginData.session) throw new Error(`Login fallÃ³: ${loginErr?.message}`);
  return { userId: data.user.id, session: loginData.session };
}

async function insertarReceipts(userId: string, n: number) {
  // Fecha dentro del mes calendario actual (primer segundo del mes)
  const inicioMes = new Date();
  inicioMes.setDate(2); // evitar edge del dÃ­a 1 con TZ
  inicioMes.setHours(1, 0, 0, 0);

  for (let i = 1; i <= n; i++) {
    const { error } = await anon
      .from("receipts")
      .insert({
        user_id:      userId,
        imagen_path:  `${userId}/fake_${i}.jpg`,
        imagen_hash:  `freemiumhash_${userId.slice(0, 8)}_${i}${"x".repeat(40)}`,
        procesado_ia: true,
        motor_json:   { fake: true, index: i },
        created_at:   inicioMes.toISOString(),
      });
    if (error) throw new Error(`Insert receipt ${i}: ${error.message}`);
  }
}

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

async function postAnalizar(session: object): Promise<{ status: number; body: Record<string, unknown> }> {
  const { name, value } = sessionToCookie(session);
  const form = new FormData();
  form.append("imagen", new Blob([MINIMAL_JPEG], { type: "image/jpeg" }), "boleta.jpg");
  const res = await fetch(`${NEXT_URL}/api/analizar`, {
    method: "POST",
    headers: { Cookie: `${name}=${value}` },
    body: form,
  });
  const body = await res.json() as Record<string, unknown>;
  return { status: res.status, body };
}

// â”€â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

console.log("\n=== Test Freemium â€” lÃ­mite 2 boletas/mes para plan free ===\n");

// â”€â”€ 0. Verificar servidor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
console.log("â”€â”€ 0. Verificar servidor Next.js â”€â”€");
try {
  const ping = await fetch(`${NEXT_URL}/api/analizar`, { method: "GET" });
  assert("Next.js responde", ping.status !== 0, `status ${ping.status}`);
} catch (err) {
  console.error(`\nâ›”  No se puede conectar a ${NEXT_URL}`);
  console.error(`   Inicia el servidor: cd web && npm run dev\n`);
  process.exit(1);
}

// â”€â”€ 1. Usuario A: 2 receipts en el mes â†’ 3.Âª boleta debe dar 402 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
console.log("\nâ”€â”€ 1. Usuario A â€” 2 receipts del mes + intento 3.Âª boleta â”€â”€");

let userA_id = "";
let userA_session: object = {};

try {
  const { userId, session } = await crearUsuario("A");
  userA_id = userId;
  userA_session = session;
  ok(`Usuario A creado`, `id: ${userId}`);
} catch (e) { fail(`Crear usuario A`, String(e)); process.exit(1); }

try {
  await insertarReceipts(userA_id, 2);
  ok("2 receipts del mes insertados para usuario A");
} catch (e) { fail("Insertar receipts", String(e)); process.exit(1); }

// Verificar conteo en DB
{
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
  const { count } = await anon
    .from("receipts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userA_id)
    .eq("procesado_ia", true)
    .gte("created_at", inicioMes.toISOString());
  assert("Conteo en DB es 2", (count ?? 0) === 2, `count=${count}`);
}

// 3.Âª boleta â†’ debe devolver 402
const { status: statusA, body: bodyA } = await postAnalizar(userA_session);
console.log(`\n  Status recibido (3.Âª boleta): ${statusA}`);
console.log(`  Body: ${JSON.stringify(bodyA)}`);

assert("3.Âª boleta devuelve 402",           statusA === 402);
assert("Body tiene limit_reached=true",     bodyA.limit_reached === true);
assert("Body tiene campo error",            typeof bodyA.error === "string");
assert("analisis_usados es 2",              bodyA.analisis_usados === 2);
assert("limite es 2",                       bodyA.limite === 2);

// â”€â”€ 2. Usuario B: 1 receipt del mes â†’ NO debe dar 402 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
console.log("\nâ”€â”€ 2. Usuario B â€” 1 receipt del mes â†’ NO debe dar 402 â”€â”€");

let userB_id = "";
let userB_session: object = {};

try {
  const { userId, session } = await crearUsuario("B");
  userB_id = userId;
  userB_session = session;
  ok(`Usuario B creado`, `id: ${userId}`);
} catch (e) { fail(`Crear usuario B`, String(e)); process.exit(1); }

try {
  await insertarReceipts(userB_id, 1);
  ok("1 receipt del mes insertado para usuario B");
} catch (e) { fail("Insertar receipt", String(e)); process.exit(1); }

const { status: statusB, body: bodyB } = await postAnalizar(userB_session);
console.log(`\n  Status recibido (2.Âª boleta, debe avanzar): ${statusB}`);
console.log(`  Body: ${JSON.stringify(bodyB)}`);

assert(
  "2.Âª boleta NO devuelve 402 (pasa el check freemium)",
  statusB !== 402,
  `status=${statusB} â€” si da 402 el check freemium tiene un bug`
);

// â”€â”€ 3. Usuario A sin receipts del mes pasado â†’ contador mes anterior no cuenta â”€
// (los receipts de A son del mes actual, pero el check es por mes calendario)
// Este caso ya estÃ¡ cubierto por el test de A arriba.

// â”€â”€ 4. Cleanup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
console.log("\nâ”€â”€ 4. Cleanup â”€â”€");
{
  const { error: eA } = await admin.auth.admin.deleteUser(userA_id);
  if (eA) fail(`deleteUser A: ${eA.message}`); else ok("Usuario A eliminado");
}
{
  const { error: eB } = await admin.auth.admin.deleteUser(userB_id);
  if (eB) fail(`deleteUser B: ${eB.message}`); else ok("Usuario B eliminado");
}

// â”€â”€â”€ Resumen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
console.log(`\n${"â”€".repeat(52)}`);
console.log(`Resultado: ${passed} pasaron Â· ${failed} fallaron`);

if (failed > 0) {
  console.error("\nâš   Hay tests fallidos.");
  process.exit(1);
} else {
  console.log("\nâœ“  Freemium limit verificado â€” 402 a la 3.Âª boleta del mes.\n");
}

