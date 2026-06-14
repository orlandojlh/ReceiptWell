import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { analyzeReceipt } from "../src/engine/analyze.js";
import type { ResultadoOk } from "../src/engine/schema.js";

dotenv.config();

interface GroundTruthProducto {
  nombre_contiene: string;
  precio: number;
  nova_esperado: number;
}

interface GroundTruth {
  total_boleta: number;
  n_productos: number;
  productos: GroundTruthProducto[];
}

interface EvalResult {
  boleta: string;
  latencia_s: number;
  estado: string;
  n_productos_detectados: number;
  n_productos_esperados: number;
  productos_precio_exacto: number;
  productos_nova_correcto: number;
  total_boleta_esperado: number;
  total_boleta_obtenido: number;
  diff_total_pct: number;
  error?: string;
}

const BOLETAS_DIR = path.join(process.cwd(), "boletas");
const GT_DIR = path.join(process.cwd(), "eval", "ground-truth");
const RESULTS_DIR = path.join(process.cwd(), "eval", "results");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

function getImageFiles(): string[] {
  if (!fs.existsSync(BOLETAS_DIR)) return [];
  return fs.readdirSync(BOLETAS_DIR).filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()));
}

function loadGroundTruth(imageName: string): GroundTruth | null {
  const base = path.basename(imageName, path.extname(imageName));
  const gtPath = path.join(GT_DIR, `${base}.json`);
  if (!fs.existsSync(gtPath)) return null;
  return JSON.parse(fs.readFileSync(gtPath, "utf-8")) as GroundTruth;
}

function evalProductos(
  resultado: ResultadoOk,
  gt: GroundTruth
): { precioExacto: number; novaCorrect: number } {
  let precioExacto = 0;
  let novaCorrect = 0;

  for (const gtProd of gt.productos) {
    const match = resultado.productos.find((p) =>
      p.nombre.toLowerCase().includes(gtProd.nombre_contiene.toLowerCase()) ||
      p.nombre_boleta.toLowerCase().includes(gtProd.nombre_contiene.toLowerCase())
    );
    if (!match) continue;
    if (match.precio === gtProd.precio) precioExacto++;
    if (match.categoria_nova === gtProd.nova_esperado) novaCorrect++;
  }

  return { precioExacto, novaCorrect };
}

function pct(n: number, total: number): string {
  if (total === 0) return "N/A";
  return `${((n / total) * 100).toFixed(0)}%`;
}

function generateMarkdown(results: EvalResult[]): string {
  const ts = new Date().toISOString().slice(0, 16).replace("T", " ");
  let md = `# Reporte de Evaluación ReceiptWell\n\n_Generado: ${ts}_\n\n`;

  md += `## Resultados por boleta\n\n`;
  md += `| Boleta | Estado | Latencia | Prods detectados | Precio exacto | NOVA correcto | Diff total |\n`;
  md += `|--------|--------|----------|-----------------|---------------|---------------|------------|\n`;

  for (const r of results) {
    if (r.error || r.estado !== "ok") {
      md += `| ${r.boleta} | ${r.estado} | ${r.latencia_s}s | — | — | — | — |\n`;
      continue;
    }
    const precPct = pct(r.productos_precio_exacto, r.n_productos_esperados);
    const novaPct = pct(r.productos_nova_correcto, r.n_productos_esperados);
    const diffStr = r.diff_total_pct !== -1 ? `${r.diff_total_pct.toFixed(1)}%` : "sin GT";
    md += `| ${r.boleta} | ok | ${r.latencia_s}s | ${r.n_productos_detectados} (esp: ${r.n_productos_esperados}) | ${precPct} | ${novaPct} | ${diffStr} |\n`;
  }

  const okResults = results.filter((r) => r.estado === "ok" && !r.error);
  if (okResults.length > 0) {
    const avgLatencia = okResults.reduce((s, r) => s + r.latencia_s, 0) / okResults.length;
    const totalEsperados = okResults.reduce((s, r) => s + r.n_productos_esperados, 0);
    const totalPrecioOk = okResults.reduce((s, r) => s + r.productos_precio_exacto, 0);
    const totalNovaOk = okResults.reduce((s, r) => s + r.productos_nova_correcto, 0);
    const withDiff = okResults.filter((r) => r.diff_total_pct !== -1);
    const avgDiff =
      withDiff.length > 0
        ? withDiff.reduce((s, r) => s + r.diff_total_pct, 0) / withDiff.length
        : -1;

    md += `\n## Promedios\n\n`;
    md += `| Métrica | Valor |\n|---------|-------|\n`;
    md += `| Latencia promedio | ${avgLatencia.toFixed(1)}s |\n`;
    md += `| Precio exacto (promedio) | ${pct(totalPrecioOk, totalEsperados)} |\n`;
    md += `| NOVA correcto (promedio) | ${pct(totalNovaOk, totalEsperados)} |\n`;
    md += `| Diff total promedio | ${avgDiff !== -1 ? avgDiff.toFixed(1) + "%" : "N/A"} |\n`;
    md += `| Boletas procesadas | ${okResults.length} / ${results.length} |\n`;
  }

  return md;
}

async function main() {
  const images = getImageFiles();
  if (images.length === 0) {
    console.log("No hay imágenes en boletas/. Agrega fotos de boletas para evaluar.");
    process.exit(0);
  }

  console.log(`Evaluando ${images.length} boleta(s)...\n`);
  const results: EvalResult[] = [];

  for (const img of images) {
    const imagePath = path.join(BOLETAS_DIR, img);
    const gt = loadGroundTruth(img);
    console.log(`→ ${img}${gt ? "" : " (sin ground-truth)"}`);

    const t0 = Date.now();
    try {
      const resultado = await analyzeReceipt(imagePath);
      const latencia_s = parseFloat(((Date.now() - t0) / 1000).toFixed(1));

      if (resultado.estado === "rechazo") {
        results.push({
          boleta: img,
          latencia_s,
          estado: `rechazo:${resultado.motivo}`,
          n_productos_detectados: 0,
          n_productos_esperados: gt?.n_productos ?? 0,
          productos_precio_exacto: 0,
          productos_nova_correcto: 0,
          total_boleta_esperado: gt?.total_boleta ?? 0,
          total_boleta_obtenido: 0,
          diff_total_pct: -1,
        });
        continue;
      }

      const ok = resultado as ResultadoOk;
      let precioExacto = 0;
      let novaCorrect = 0;
      const nEsperados = gt?.n_productos ?? 0;

      if (gt) {
        const ev = evalProductos(ok, gt);
        precioExacto = ev.precioExacto;
        novaCorrect = ev.novaCorrect;
      }

      const diffPct =
        gt && gt.total_boleta > 0
          ? Math.abs((ok.totales.total_boleta - gt.total_boleta) / gt.total_boleta) * 100
          : -1;

      results.push({
        boleta: img,
        latencia_s,
        estado: "ok",
        n_productos_detectados: ok.productos.length,
        n_productos_esperados: nEsperados,
        productos_precio_exacto: precioExacto,
        productos_nova_correcto: novaCorrect,
        total_boleta_esperado: gt?.total_boleta ?? 0,
        total_boleta_obtenido: ok.totales.total_boleta,
        diff_total_pct: diffPct,
      });
    } catch (err) {
      const latencia_s = parseFloat(((Date.now() - t0) / 1000).toFixed(1));
      results.push({
        boleta: img,
        latencia_s,
        estado: "error",
        n_productos_detectados: 0,
        n_productos_esperados: gt?.n_productos ?? 0,
        productos_precio_exacto: 0,
        productos_nova_correcto: 0,
        total_boleta_esperado: gt?.total_boleta ?? 0,
        total_boleta_obtenido: 0,
        diff_total_pct: -1,
        error: String(err),
      });
      console.error(`  ERROR: ${err}`);
    }
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const reportPath = path.join(RESULTS_DIR, `eval-${ts}.md`);
  const markdown = generateMarkdown(results);
  fs.writeFileSync(reportPath, markdown, "utf-8");

  console.log(`\nReporte guardado en: ${reportPath}\n`);
  console.log(markdown);
}

main();
