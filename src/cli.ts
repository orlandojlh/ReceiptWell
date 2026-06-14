import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { analyzeReceipt } from "./engine/analyze.js";
import { buildReport } from "./report/build.js";
import { createLocalHistoryStore } from "./report/history.js";
import { HouseholdProfileSchema, type Report } from "./report/schema.js";

// ─── Helpers de formato consola ───────────────────────────────────────────────

const SEP  = "═".repeat(58);
const SEP2 = "─".repeat(58);

function line(label: string, value: string | number): void {
  const l = String(label).padEnd(26);
  console.log(`  ${l}${value}`);
}

function clp(n: number): string {
  return `$${n.toLocaleString("es-CL")} CLP`;
}

function printReport(r: Report): void {
  console.log(`\n${SEP}`);
  console.log(`  ReceiptWell — Reporte de 4 Capas`);
  console.log(`  Boleta ID : ${r.boletaId}`);
  console.log(`  Fecha     : ${new Date(r.fecha).toLocaleString("es-CL")}`);
  console.log(SEP);

  // ── Capa 1 ────────────────────────────────────────────────────────────────
  console.log(`\n  ┌─ CAPA 1 · ESPEJO FINANCIERO ${"─".repeat(24)}┐`);
  line("Total boleta",           clp(r.capa1_espejoFinanciero.totalBoleta));
  line("Total ultraprocesados",  clp(r.capa1_espejoFinanciero.totalUltraprocesados));
  line("% ultraprocesados",      `${r.capa1_espejoFinanciero.pctUltraprocesados.toFixed(1)}%`);
  line("Proyección anual ultra", clp(r.capa1_espejoFinanciero.proyeccionAnualUltra));
  line("Frecuencia asumida",     `${r.capa1_espejoFinanciero.frecuenciaAsumida} boletas/mes`);

  // ── Capa 2 ────────────────────────────────────────────────────────────────
  console.log(`\n  ┌─ CAPA 2 · RIESGO DE SALUD ${"─".repeat(27)}┐`);
  line("Nivel de riesgo", r.capa2_riesgoSalud.nivel.toUpperCase());
  console.log(`\n  Factores detectados:`);
  for (const f of r.capa2_riesgoSalud.factores) {
    console.log(`    · ${f}`);
  }
  console.log(`\n  Narrativa:`);
  console.log(wordWrap(`    ${r.capa2_riesgoSalud.narrativa}`, 56));
  console.log(`\n  ${r.capa2_riesgoSalud.disclaimer}`);

  // ── Capa 3 ────────────────────────────────────────────────────────────────
  console.log(`\n  ┌─ CAPA 3 · COSTO EN SUDOR ${"─".repeat(28)}┐`);
  line("Calorías totales boleta", `${r.capa3_costoEnSudor.caloriasTotales} kcal`);
  line("Calorías ultraprocesados", `${r.capa3_costoEnSudor.caloriasUltra} kcal`);
  console.log(`\n  Para quemar las kcal de ultraprocesados:`);
  line("  Caminata",        `${r.capa3_costoEnSudor.equivalencias.caminataHoras} horas`);
  line("  Trote",           `${r.capa3_costoEnSudor.equivalencias.troteHoras} horas`);
  line("  Sesiones gimnasio",`${r.capa3_costoEnSudor.equivalencias.gimnasioSesiones} sesiones (1h c/u)`);

  // ── Capa 4 ────────────────────────────────────────────────────────────────
  console.log(`\n  ┌─ CAPA 4 · PLAN DE CORRECCIÓN ${"─".repeat(24)}┐`);
  r.capa4_planCorreccion.swaps.forEach((s, i) => {
    console.log(`\n  Swap ${i + 1}  [${s.tipo.toUpperCase()}]`);
    console.log(`    ✗  ${s.producto}`);
    console.log(`    ✓  ${s.alternativa}`);
    line("    Ahorro/mes",          clp(s.ahorroCLPMes));
    line("    Diferencia nutri.",   s.diferenciaNutricional);
    line("    Disponible en",       s.disponibleEn.join(", "));
  });

  // ── Marcador ──────────────────────────────────────────────────────────────
  console.log(`\n${SEP2}`);
  console.log(`  MARCADOR`);
  line("Score alimentario",   `${r.marcador.score} / 100`);
  line("Tendencia",           r.marcador.tendencia);
  line("Ahorro acumulado",    clp(r.marcador.ahorroAcumuladoCLP));
  console.log(`${SEP}\n`);
}

function wordWrap(text: string, maxWidth: number): string {
  const indent = text.match(/^\s*/)?.[0] ?? "";
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = indent;
  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth && current.trim().length > 0) {
      lines.push(current);
      current = indent + word;
    } else {
      current = current.length === indent.length ? current + word : current + " " + word;
    }
  }
  if (current.trim().length > 0) lines.push(current);
  return lines.join("\n");
}

// ─── Helpers interactivos ─────────────────────────────────────────────────────

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptPassword(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  process.stderr.write(question);
  // Disable echo for password input on supported terminals
  if ((process.stdin as NodeJS.ReadStream).isTTY) {
    (process.stdin as NodeJS.ReadStream).setRawMode?.(true);
  }
  return new Promise((resolve) => {
    let password = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.once("data", (chunk) => {
      password = String(chunk).replace(/[\r\n]/g, "");
      process.stderr.write("\n");
      rl.close();
      resolve(password);
    });
  });
}

// ─── Parseo de argumentos ─────────────────────────────────────────────────────

interface CliArgs {
  imagePath: string;
  modoReporte: boolean;
  perfilPath: string | null;
  userId: string | null;
  authCmd: string | null;    // "login" | "login-google" | "logout" | "status"
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);

  const authIdx = args.indexOf("--auth");
  const authCmd = authIdx !== -1 ? args[authIdx + 1] ?? null : null;

  const userIdx = args.indexOf("--user-id");
  const userId = userIdx !== -1 ? args[userIdx + 1] ?? null : null;

  const imagePath = args.find((a) => !a.startsWith("--")) ?? "";

  const modoReporte = args.includes("--reporte");

  const perfilIdx = args.indexOf("--perfil");
  const perfilPath = perfilIdx !== -1 ? args[perfilIdx + 1] ?? null : null;

  return { imagePath, modoReporte, perfilPath, userId, authCmd };
}

// ─── Comandos de auth ─────────────────────────────────────────────────────────

async function handleAuth(cmd: string): Promise<void> {
  const { supabase } = await import("./supabase/client.js");
  const { login, logout, getCurrentUser } = await import("./supabase/auth.js");

  switch (cmd) {
    case "login": {
      const email = await prompt("Email: ");
      const password = await promptPassword("Contraseña: ");
      try {
        const user = await login(email, password);
        console.log(`\n✓ Sesión iniciada como ${user.email}`);
        console.log(`  User ID: ${user.id}`);
        console.log(`\n  Para procesar boletas con tu cuenta:`);
        console.log(`  npx tsx src/cli.ts ./foto.jpg --reporte --user-id ${user.id}\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n✗ Error al iniciar sesión: ${msg}\n`);
        process.exit(1);
      }
      break;
    }

    case "login-google": {
      console.log("\nGoogle OAuth no está disponible en el CLI sin frontend.");
      console.log("Usa el flujo web o ejecuta desde el navegador.\n");
      break;
    }

    case "logout": {
      await logout();
      console.log("\n✓ Sesión cerrada.\n");
      break;
    }

    case "status": {
      const user = await getCurrentUser();
      if (user) {
        console.log(`\n✓ Sesión activa: ${user.email}`);
        console.log(`  User ID: ${user.id}\n`);
      } else {
        console.log("\n  Sin sesión activa. Usa --auth login.\n");
      }
      break;
    }

    default:
      console.error(`\nComando de auth desconocido: "${cmd}"`);
      console.error("Opciones: login, login-google, logout, status\n");
      process.exit(1);
  }
}

// ─── Flujo Supabase con usuario ───────────────────────────────────────────────

async function runWithUser(
  userId: string,
  absImage: string,
  profile: ReturnType<typeof HouseholdProfileSchema.parse>
): Promise<void> {
  const { supabase } = await import("./supabase/client.js");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.error("\n✗ No hay sesión activa. Ejecuta primero:");
    console.error("  npx tsx src/cli.ts --auth login\n");
    process.exit(1);
  }

  const { uploadReceiptImage } = await import("./supabase/receipts.js");
  const { createReceipt, saveReport } = await import("./supabase/users.js");

  // 1. Upload imagen
  const fileName = `${Date.now()}_${path.basename(absImage)}`;
  console.error("Subiendo imagen...");
  const imageData = fs.readFileSync(absImage);
  const { path: storagePath } = await uploadReceiptImage(userId, fileName, imageData);
  console.error(`  ✓ Storage: ${storagePath}`);

  // 2. Analizar boleta
  console.error("Analizando boleta con IA...");
  const resultado = await analyzeReceipt(absImage);
  if (resultado.estado === "rechazo") {
    console.error(`\n✗ Boleta rechazada: ${resultado.motivo}`);
    console.error(resultado.mensaje_usuario);
    process.exit(1);
  }

  // 3. Guardar motor_json en receipts
  const receipt = await createReceipt(userId, storagePath, resultado);
  console.error(`  ✓ Receipt guardado (id: ${receipt.id})`);

  // 4. Generar reporte (history en Supabase)
  console.error("Generando reporte...");
  const report = await buildReport(resultado, profile, userId);

  // 5. Guardar reporte
  const savedReport = await saveReport(userId, receipt.id, report);
  console.error(`  ✓ Reporte guardado (id: ${savedReport.id})`);

  // 6. Imprimir
  printReport(report);

  // 7. Guardar JSON local también
  const outDir = path.join(process.cwd(), "data", "reportes");
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `reporte_${ts}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
  console.error(`Reporte guardado localmente: ${outPath}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { imagePath, modoReporte, perfilPath, userId, authCmd } = parseArgs(process.argv);

  // ── Comandos de auth (no requieren imagen) ────────────────────────────────
  if (authCmd) {
    await handleAuth(authCmd);
    return;
  }

  // ── Validar que hay imagen para los demás modos ───────────────────────────
  if (!imagePath) {
    console.error(
      "Uso:\n" +
      "  npx tsx src/cli.ts ./boletas/foto.jpg\n" +
      "  npx tsx src/cli.ts ./boletas/foto.jpg --reporte [--perfil ./perfil.json]\n" +
      "  npx tsx src/cli.ts ./boletas/foto.jpg --reporte --user-id <uuid>\n\n" +
      "  npx tsx src/cli.ts --auth login\n" +
      "  npx tsx src/cli.ts --auth login-google\n" +
      "  npx tsx src/cli.ts --auth status\n" +
      "  npx tsx src/cli.ts --auth logout"
    );
    process.exit(1);
  }

  const absImage = path.resolve(imagePath);
  console.error(`\nAnalizando: ${absImage}`);

  try {
    // ── Modo con usuario: delegar flujo completo ──────────────────────────
    if (userId && modoReporte) {
      let profileRaw: unknown = {};
      if (perfilPath) {
        const abs = path.resolve(perfilPath);
        if (!fs.existsSync(abs)) {
          console.error(`No se encontró el perfil: ${abs}`);
          process.exit(1);
        }
        profileRaw = JSON.parse(fs.readFileSync(abs, "utf-8"));
      }
      const profile = HouseholdProfileSchema.parse(profileRaw);
      await runWithUser(userId, absImage, profile);
      return;
    }

    // ── Modo original: analizar sin usuario ───────────────────────────────
    const resultado = await analyzeReceipt(absImage);

    if (!modoReporte) {
      console.log(JSON.stringify(resultado, null, 2));
      return;
    }

    if (resultado.estado === "rechazo") {
      console.error(`\nBoleta rechazada: ${resultado.motivo}`);
      console.error(resultado.mensaje_usuario);
      process.exit(1);
    }

    // Cargar perfil
    let profileRaw: unknown = {};
    if (perfilPath) {
      const abs = path.resolve(perfilPath);
      if (!fs.existsSync(abs)) {
        console.error(`No se encontró el perfil: ${abs}`);
        process.exit(1);
      }
      profileRaw = JSON.parse(fs.readFileSync(abs, "utf-8"));
    }
    const profile = HouseholdProfileSchema.parse(profileRaw);

    console.error(`Generando reporte (perfil: ${profile.adultos}a·${profile.ninos}n·${profile.objetivo})...`);

    const history = createLocalHistoryStore();
    const report = await buildReport(resultado, profile, history);

    printReport(report);

    const outDir = path.join(process.cwd(), "data", "reportes");
    fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const outPath = path.join(outDir, `reporte_${ts}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
    console.error(`Reporte guardado en: ${outPath}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nError: ${msg}`);
    process.exit(1);
  }
}

main();
