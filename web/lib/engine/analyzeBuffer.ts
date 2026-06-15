/**
 * Versión web del motor de análisis.
 * Acepta un Buffer + mimeType directamente (sin fs.readFileSync).
 * Lógica idéntica a src/engine/analyze.ts pero sin dependencias de Node filesystem.
 */

import { GoogleGenAI } from "@google/genai";
import { ResultadoSchema, type Resultado } from "@/lib/motor";
import { PROMPT_EXTRACT_V2 } from "@/lib/prompts/extract-v2";

const MODEL = "gemini-2.5-flash";

function prepareBuffer(
  buf: Buffer,
  mimeType: string
): { data: string; mimeType: string } {
  return { data: buf.toString("base64"), mimeType };
}

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

async function callGemini(
  client: GoogleGenAI,
  imageData: string,
  mimeType: string,
  errorContext?: string
): Promise<string> {
  const prompt = errorContext
    ? `${PROMPT_EXTRACT_V2}\n\n=== CORRECCIÓN REQUERIDA ===\nTu respuesta anterior falló con:\n${errorContext}\nCorrige el JSON y devuelve SOLO el JSON válido.`
    : PROMPT_EXTRACT_V2;

  const response = await client.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: imageData } },
        ],
      },
    ],
    config: { responseMimeType: "application/json" },
  });

  return response.text ?? "";
}

export async function analyzeBuffer(
  buf: Buffer,
  mimeType: string
): Promise<Resultado> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no configurada");
  }

  const client = new GoogleGenAI({ apiKey });
  const { data: imageData, mimeType: finalMime } = await prepareBuffer(buf, mimeType);

  let raw = await callGemini(client, imageData, finalMime);
  let cleaned = stripFences(raw);
  let parsed: unknown;

  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const msg = `JSON inválido: ${String(e)}`;
    raw = await callGemini(client, imageData, finalMime, msg);
    cleaned = stripFences(raw);
    try {
      parsed = JSON.parse(cleaned);
    } catch (e2) {
      throw new Error(`El modelo devolvió JSON inválido dos veces: ${String(e2)}`);
    }
  }

  const v1 = ResultadoSchema.safeParse(parsed);
  if (!v1.success) {
    const msg = `Validación Zod: ${JSON.stringify(v1.error.issues, null, 2)}`;
    raw = await callGemini(client, imageData, finalMime, msg);
    cleaned = stripFences(raw);
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`JSON inválido en reintento: ${String(e)}`);
    }
    const v2 = ResultadoSchema.safeParse(parsed);
    if (!v2.success) {
      throw new Error(
        `Validación fallida dos veces: ${JSON.stringify(v2.error.issues, null, 2)}`
      );
    }
    return v2.data;
  }

  return v1.data;
}
