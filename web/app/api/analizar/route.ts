import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { analyzeBuffer } from "@/lib/engine/analyzeBuffer";
import { createWebHistoryStore } from "@/lib/report/historyStore";
import { buildReport, HouseholdProfileSchema } from "@/lib/motor";

// Tipos aceptados — se validan por magic bytes en el motor, aquí filtramos
// solo lo que los navegadores envían desde <input accept="image/*,application/pdf">
const ACCEPTED_MIMES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/heic", "image/heif", "application/pdf",
]);

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const RATE_LIMIT_PER_HOUR = 3;
const FREE_MONTHLY_LIMIT = 2;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  // ── 1. Validar sesión ────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return json({ error: "No autenticado" }, 401);
  }

  // ── 2. Parsear multipart form ────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "Formato de solicitud inválido" }, 400);
  }

  const file = formData.get("imagen");
  if (!(file instanceof File)) {
    return json({ error: "Falta el campo 'imagen'" }, 400);
  }

  // ── 3. Validar tipo y tamaño ─────────────────────────────────────────────
  const mimeType = file.type || "image/jpeg";
  if (!ACCEPTED_MIMES.has(mimeType)) {
    return json({
      error: "Tipo de archivo no soportado. Sube una imagen (JPG, PNG, WEBP, HEIC) o PDF.",
    }, 400);
  }

  if (file.size > MAX_FILE_BYTES) {
    return json({ error: "El archivo supera el límite de 10 MB." }, 400);
  }

  const arrayBuf = await file.arrayBuffer();
  const buf = Buffer.from(arrayBuf);

  // ── 4. Anti-abuso: hash SHA-256 → detectar duplicado ────────────────────
  const imagenHash = createHash("sha256").update(buf).digest("hex");
  const svc = createServiceClient();

  // ── 4b. Detectar duplicado ANTES del check freemium ─────────────────────
  //  Los duplicados no consumen cuota mensual: el usuario ya pagó esa boleta.
  const { data: existente } = await svc
    .from("receipts")
    .select("id, reports(id)")
    .eq("user_id", user.id)
    .eq("imagen_hash", imagenHash)
    .limit(1)
    .single();

  if (existente) {
    const reportId =
      Array.isArray(existente.reports) && existente.reports.length > 0
        ? (existente.reports[0] as { id: string }).id
        : null;

    return json({
      reportId,
      duplicado: true,
      mensaje: "Ya analizamos esta boleta. Aquí está tu reporte anterior.",
    });
  }

  // ── 5. Freemium: límite de boletas IA por mes calendario ─────────────────
  const { data: userPlan } = await svc
    .from("users")
    .select("plan, plan_expires_at")
    .eq("id", user.id)
    .single();

  const plan = userPlan?.plan ?? "free";
  const esPremium =
    (plan === "premium" &&
      (!userPlan?.plan_expires_at ||
        new Date(userPlan.plan_expires_at) > new Date())) ||
    plan === "founding";

  if (!esPremium) {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const { count: analisisMes } = await svc
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("procesado_ia", true)
      .gte("created_at", inicioMes.toISOString());

    if ((analisisMes ?? 0) >= FREE_MONTHLY_LIMIT) {
      return json(
        {
          error: `Has usado tus ${FREE_MONTHLY_LIMIT} boletas gratis de este mes. Mejora tu plan para continuar.`,
          limit_reached: true,
          analisis_usados: analisisMes ?? 0,
          limite: FREE_MONTHLY_LIMIT,
        },
        402
      );
    }
  }

  // ── 6. Anti-abuso: rate limit — máx 3 análisis con IA por hora ──────────
  const unaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count: analisesRecientes } = await svc
    .from("receipts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("procesado_ia", true)
    .gte("created_at", unaHoraAtras);

  if ((analisesRecientes ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return json(
      {
        error: "Demasiados análisis en poco tiempo. Espera un momento y vuelve a intentarlo.",
        retry_after_minutes: 60,
      },
      429
    );
  }

  // ── 7. Subir imagen a storage (antes de IA, para no perder el archivo) ───
  const fileName = `${Date.now()}_${imagenHash.slice(0, 8)}.${mimeType.split("/")[1] ?? "jpg"}`;
  const storagePath = `${user.id}/${fileName}`;

  const { error: uploadError } = await svc.storage
    .from("receipts")
    .upload(storagePath, buf, { contentType: mimeType, upsert: false });

  if (uploadError) {
    console.error("storage upload error:", uploadError.message);
    return json({ error: "Error al subir la imagen. Intenta de nuevo." }, 500);
  }

  // ── 7. Llamar al motor de IA ─────────────────────────────────────────────
  let resultado;
  try {
    resultado = await analyzeBuffer(buf, mimeType);
  } catch (err) {
    // Si el motor falla (ej. sin cuota), limpiar el archivo subido y reportar
    await svc.storage.from("receipts").remove([storagePath]);
    const msg = err instanceof Error ? err.message : String(err);
    console.error("analyzeBuffer error:", msg);
    return json(
      { error: "Error al analizar la boleta. Intenta de nuevo más tarde." },
      500
    );
  }

  // ── 8. Manejar rechazo del motor ─────────────────────────────────────────
  if (resultado.estado === "rechazo") {
    // Guardar en receipts solo si se procesó con IA (para el rate limit)
    if (resultado.se_proceso) {
      await svc.from("receipts").insert({
        user_id: user.id,
        imagen_path: storagePath,
        imagen_hash: imagenHash,
        procesado_ia: true,
        motor_json: resultado as unknown as Record<string, unknown>,
      });
    }

    return json(
      {
        error: resultado.mensaje_usuario,
        motivo: resultado.motivo,
        rechazado: true,
      },
      422
    );
  }

  // ── 9. Construir reporte 4 capas ─────────────────────────────────────────
  // Obtener perfil del usuario (si no existe en users, usar defaults)
  const { data: userRow } = await svc
    .from("users")
    .select("adultos, ninos, objetivo, condiciones")
    .eq("id", user.id)
    .single();

  const profile = HouseholdProfileSchema.parse({
    adultos: userRow?.adultos ?? 1,
    ninos: userRow?.ninos ?? 0,
    objetivo: userRow?.objetivo ?? "equilibrio",
    condiciones: userRow?.condiciones ?? [],
  });

  const historyStore = createWebHistoryStore(svc, user.id);
  let report;
  try {
    report = await buildReport(resultado, profile, historyStore);
  } catch (err) {
    console.error("buildReport error:", err);
    return json({ error: "Error al construir el reporte. Intenta de nuevo." }, 500);
  }

  // ── 10. Persistir receipt + report ──────────────────────────────────────
  const { data: receiptRow, error: receiptError } = await svc
    .from("receipts")
    .insert({
      user_id: user.id,
      imagen_path: storagePath,
      imagen_hash: imagenHash,
      procesado_ia: true,
      motor_json: resultado as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();

  if (receiptError || !receiptRow) {
    console.error("insert receipt error:", receiptError?.message);
    return json({ error: "Error al guardar el análisis. Intenta de nuevo." }, 500);
  }

  const { data: reportRow, error: reportError } = await svc
    .from("reports")
    .insert({
      user_id: user.id,
      receipt_id: receiptRow.id,
      report_json: report as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();

  if (reportError || !reportRow) {
    console.error("insert report error:", reportError?.message);
    return json({ error: "Error al guardar el reporte. Intenta de nuevo." }, 500);
  }

  return json({ reportId: reportRow.id });
}

 
