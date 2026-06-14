import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
import type { ResultadoOk } from "../engine/schema.js";
import type { HouseholdProfile } from "../report/schema.js";
import type { NivelRiesgo } from "../report/risk.js";

dotenv.config();

const MODEL = "gemini-2.5-flash";

// ─── Schema de respuesta IA (solo lo que genera la IA) ───────────────────────

const SwapIASchema = z.object({
  producto: z.string(),
  alternativa: z.string(),
  tipo: z.enum(["salud", "dinero", "equilibrio"]),
  ahorroCLPMes: z.number().int(),
  diferenciaNutricional: z.string(),
  disponibleEn: z.array(z.enum(["Líder", "Jumbo", "Santa Isabel", "Unimarc"])),
});

export const ReportIAResponseSchema = z.object({
  narrativaSalud: z.string(),
  swaps: z.array(SwapIASchema).length(3),
});

export type ReportIAResponse = z.infer<typeof ReportIAResponseSchema>;

// ─── Construcción del prompt ─────────────────────────────────────────────────

function buildPrompt(
  motor: ResultadoOk,
  profile: HouseholdProfile,
  nivel: NivelRiesgo,
  pctUltraprocesados: number
): string {
  const productosNova34 = motor.productos
    .filter((p) => p.es_alimento && p.categoria_nova >= 3)
    .sort((a, b) => b.precio * b.cantidad - a.precio * a.cantidad)
    .map(
      (p) =>
        `- ${p.nombre} | NOVA ${p.categoria_nova} | $${(p.precio * p.cantidad).toLocaleString("es-CL")} CLP`
    )
    .join("\n");

  const todosProductos = motor.productos
    .filter((p) => p.es_alimento)
    .map(
      (p) =>
        `- ${p.nombre} | NOVA ${p.categoria_nova} | $${(p.precio * p.cantidad).toLocaleString("es-CL")} CLP | cantidad: ${p.cantidad}`
    )
    .join("\n");

  const perfilTexto = [
    `Adultos: ${profile.adultos}`,
    `Niños: ${profile.ninos}`,
    `Objetivo: ${profile.objetivo}`,
    profile.condiciones.length > 0
      ? `Condiciones declaradas: ${profile.condiciones.join(", ")}`
      : "Sin condiciones declaradas",
  ].join(" | ");

  return `Eres un asistente de nutrición preventiva para la app ReceiptWell (Chile). Tu única salida es JSON válido, sin markdown, sin backticks, sin explicaciones.

=== CONTEXTO DE LA BOLETA ===

Todos los productos de la boleta:
${todosProductos}

Productos NOVA 3-4 (candidatos a swap):
${productosNova34.length > 0 ? productosNova34 : "Ninguno — usar optimización de precio"}

Supermercado: ${motor.supermercado}
Perfil del hogar: ${perfilTexto}
Nivel de riesgo calculado: ${nivel}
Total boleta: $${motor.totales.total_boleta.toLocaleString("es-CL")} CLP
% ultraprocesados (cifra oficial, usa SOLO esta): ${pctUltraprocesados.toFixed(1)}%

=== TAREA ===

Devuelve EXACTAMENTE este JSON con dos claves:

1. narrativaSalud: máximo 3 frases sobre los hábitos observados en la boleta.
   REGLAS DURAS DE LENGUAJE — violación = respuesta inválida:
   ✓ SOLO usar: "está asociado a", "puede contribuir a", "se relaciona con", "podría aumentar el riesgo de"
   ✗ PROHIBIDO usar: "causa", "provoca", "produce", "enfermarás", "tendrás", "desarrollarás", diagnósticos médicos directos
   ✓ Tono: señala el patrón + una acción concreta. NUNCA solo culpa sin solución.
   ✓ Mencionar el nivel de riesgo (${nivel}) y el objetivo del hogar (${profile.objetivo}).
   ${profile.condiciones.length > 0 ? `✓ Considerar las condiciones declaradas: ${profile.condiciones.join(", ")}` : ""}
   ✗ PROHIBIDO INVENTAR CIFRAS: si mencionas el porcentaje de ultraprocesados usa EXACTAMENTE "${pctUltraprocesados.toFixed(1)}%" — cualquier otro número es incorrecto.
   ✓ Alternativa segura: omite el porcentaje y describe el patrón con palabras ("la boleta refleja un consumo elevado de ultraprocesados").

2. swaps: exactamente 3 objetos, uno de cada tipo (salud / dinero / equilibrio) cuando sea posible.
   REGLAS:
   - Cada swap reemplaza un producto REAL que aparece en la boleta anterior.
   - Si hay <3 productos NOVA 3-4, completar con "optimización de precio" (mismo producto, formato más conveniente).
   - Alternativas: preferir marcas propias chilenas (Great Value, Cuisine&Co, Líder, Jumbo) disponibles en supermercados reales.
   - ahorroCLPMes: (precio actual − precio alternativa estimado) × compras/mes estimadas. Entero CLP. Puede ser 0 o negativo si el swap es por salud.
   - diferenciaNutricional: dato concreto y verificable, ej: "-12 g azúcar por porción", "+4 g fibra por porción de 40g".
   - disponibleEn: solo supermercados de la lista [Líder, Jumbo, Santa Isabel, Unimarc] donde realmente se consiga la alternativa.

=== FORMATO DE SALIDA ===

{
  "narrativaSalud": "<máximo 3 frases, lenguaje protegido>",
  "swaps": [
    {
      "producto": "<nombre del producto de la boleta>",
      "alternativa": "<alternativa concreta con marca>",
      "tipo": "salud" | "dinero" | "equilibrio",
      "ahorroCLPMes": <entero CLP>,
      "diferenciaNutricional": "<diferencia concreta>",
      "disponibleEn": ["Líder", "Jumbo", "Santa Isabel", "Unimarc"]
    }
  ]
}

Responde ÚNICAMENTE con el JSON. Ningún texto antes ni después.`;
}

// ─── Llamada a la IA ─────────────────────────────────────────────────────────

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export async function callReportPrompt(
  motor: ResultadoOk,
  profile: HouseholdProfile,
  nivel: NivelRiesgo,
  pctUltraprocesados: number,
  correctionContext?: string
): Promise<{ raw: string; parsed: unknown }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Falta GEMINI_API_KEY en el archivo .env");

  const client = new GoogleGenAI({ apiKey });
  const basePrompt = buildPrompt(motor, profile, nivel, pctUltraprocesados);

  const prompt = correctionContext
    ? `${basePrompt}\n\n=== CORRECCIÓN REQUERIDA ===\nTu respuesta anterior falló la validación:\n${correctionContext}\nCorrige SOLO ese problema y devuelve el JSON completo válido.`
    : basePrompt;

  const response = await client.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" },
  });

  const raw = response.text ?? "";
  const cleaned = stripFences(raw);
  const parsed = JSON.parse(cleaned);
  return { raw: cleaned, parsed };
}
