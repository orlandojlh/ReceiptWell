import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { ResultadoSchema, type Resultado } from "./schema.js";
import { PROMPT_EXTRACT_V2 } from "../prompts/extract-v2.js";

dotenv.config();

const MODEL = "gemini-2.5-flash";
const MAX_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_DIMENSION = 1600;

/** Detecta el tipo real del archivo por magic bytes, ignorando la extensión. */
function detectMimeType(buf: Buffer, filePath: string): string {
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  // WebP: RIFF....WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  // PDF: %PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "application/pdf";
  // HEIC/HEIF: ftyp box
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return "image/heic";
  // Fallback: confiar en extensión
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".webp": "image/webp",
    ".heic": "image/heic", ".heif": "image/heif",
    ".pdf": "application/pdf",
  };
  return map[ext] ?? "image/jpeg";
}

async function prepareImage(imagePath: string): Promise<{ data: string; mimeType: string }> {
  let fileBuffer = fs.readFileSync(imagePath);
  const mimeType = detectMimeType(fileBuffer, imagePath);

  // PDFs se envían tal cual — Gemini los soporta nativamente
  if (mimeType === "application/pdf") {
    return { data: fileBuffer.toString("base64"), mimeType };
  }

  if (fileBuffer.length > MAX_SIZE_BYTES) {
    console.error(`  Imagen grande (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB), redimensionando...`);
    fileBuffer = await sharp(fileBuffer)
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    console.error(`  Redimensionada a ${(fileBuffer.length / 1024).toFixed(0)} KB`);
  }

  return { data: fileBuffer.toString("base64"), mimeType };
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
  extraContext?: string
): Promise<string> {
  const prompt = extraContext
    ? `${PROMPT_EXTRACT_V2}\n\n=== CORRECCIÓN REQUERIDA ===\nTu respuesta anterior falló la validación con este error:\n${extraContext}\nCorrige el JSON y devuelve SOLO el JSON válido.`
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
    config: {
      responseMimeType: "application/json",
    },
  });

  return response.text ?? "";
}

function saveErrorRaw(raw: string, imagePath: string): void {
  const errDir = path.join(process.cwd(), "eval", "results", "errores");
  fs.mkdirSync(errDir, { recursive: true });
  const name = path.basename(imagePath, path.extname(imagePath));
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(errDir, `${name}_${ts}.txt`);
  fs.writeFileSync(outPath, raw, "utf-8");
  console.error(`  Respuesta cruda guardada en: ${outPath}`);
}

export async function analyzeReceipt(imagePath: string): Promise<Resultado> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta GEMINI_API_KEY en el archivo .env");
  }

  if (!fs.existsSync(imagePath)) {
    throw new Error(`No se encontró el archivo: ${imagePath}`);
  }

  const start = Date.now();
  const client = new GoogleGenAI({ apiKey });

  const { data: imageData, mimeType } = await prepareImage(imagePath);

  let raw = await callGemini(client, imageData, mimeType);
  let cleaned = stripFences(raw);
  let parsed: unknown;

  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    const errorMsg = `JSON inválido: ${String(parseErr)}`;
    console.error(`  Intento 1 falló (parse): ${errorMsg}. Reintentando...`);
    raw = await callGemini(client, imageData, mimeType, errorMsg);
    cleaned = stripFences(raw);
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr2) {
      saveErrorRaw(raw, imagePath);
      throw new Error(`El modelo devolvió JSON inválido dos veces: ${String(parseErr2)}`);
    }
  }

  const validation = ResultadoSchema.safeParse(parsed);
  if (!validation.success) {
    const errorMsg = `Error de validación Zod: ${JSON.stringify(validation.error.issues, null, 2)}`;
    console.error(`  Intento 1 falló (validación). Reintentando...`);
    raw = await callGemini(client, imageData, mimeType, errorMsg);
    cleaned = stripFences(raw);
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      saveErrorRaw(raw, imagePath);
      throw new Error("El modelo devolvió JSON inválido en el reintento.");
    }
    const validation2 = ResultadoSchema.safeParse(parsed);
    if (!validation2.success) {
      saveErrorRaw(raw, imagePath);
      throw new Error(
        `Validación fallida dos veces. Errores: ${JSON.stringify(validation2.error.issues, null, 2)}`
      );
    }
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`  Completado en ${elapsed}s (con reintento)`);
    return validation2.data;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.error(`  Completado en ${elapsed}s`);
  return validation.data;
}
