import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PLAN_FOR_VARIANT } from "@/lib/lemon";

// Desactiva el body parser de Next.js — necesitamos el raw body para verificar la firma
export const runtime = "nodejs";

function ok()  { return NextResponse.json({ received: true }); }
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

async function verifySignature(request: NextRequest): Promise<string | null> {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[lemon-webhook] LEMONSQUEEZY_WEBHOOK_SECRET no configurado");
    return null;
  }

  const signature = request.headers.get("X-Signature");
  if (!signature) return null;

  const rawBody = await request.text();
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");

  try {
    if (!timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(signature, "hex"))) {
      return null;
    }
  } catch {
    return null;
  }

  return rawBody;
}

type LSEvent = {
  meta: {
    event_name: string;
    custom_data?: { user_id?: string };
  };
  data: {
    id: string;
    attributes: {
      status: string;
      variant_id: number;
      order_id?: number;
      customer_id?: number;
      renews_at?: string | null;
      ends_at?: string | null;
      trial_ends_at?: string | null;
    };
  };
};

export async function POST(request: NextRequest) {
  const rawBody = await verifySignature(request);
  if (!rawBody) return err("Firma inválida", 401);

  let event: LSEvent;
  try {
    event = JSON.parse(rawBody) as LSEvent;
  } catch {
    return err("JSON inválido");
  }

  const eventName   = event.meta.event_name;
  const userId      = event.meta.custom_data?.user_id;
  const attrs       = event.data.attributes;
  const variantId   = String(attrs.variant_id);
  const lsSubId     = event.data.id;
  const svc         = createServiceClient();

  console.log(`[lemon-webhook] ${eventName} user=${userId} variant=${variantId}`);

  // ── Suscripciones (mensual, anual, founding) ──────────────────────────────
  if (
    eventName === "subscription_created" ||
    eventName === "subscription_updated" ||
    eventName === "subscription_resumed"
  ) {
    if (!userId) return err("user_id faltante en custom_data");

    const plan = PLAN_FOR_VARIANT[variantId] ?? "premium";

    // Fecha de expiración: si founding no expira nunca (null),
    // premium expira en la próxima renovación.
    const planExpiresAt = plan === "founding"
      ? null
      : (attrs.renews_at ?? attrs.ends_at ?? null);

    await Promise.all([
      // Actualizar plan del usuario
      svc.from("users")
        .update({ plan, plan_expires_at: planExpiresAt })
        .eq("id", userId),

      // Upsert en tabla de auditoría
      svc.from("subscriptions").upsert(
        {
          ls_subscription_id: lsSubId,
          user_id: userId,
          ls_variant_id: variantId,
          plan,
          status: attrs.status,
          renews_at: attrs.renews_at ?? null,
          ends_at: attrs.ends_at ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "ls_subscription_id" }
      ),
    ]);

    return ok();
  }

  // ── Cancelación: el acceso sigue hasta ends_at ────────────────────────────
  if (eventName === "subscription_cancelled") {
    if (!userId) return err("user_id faltante en custom_data");

    // Mantener plan premium hasta que termine el período pagado
    const planExpiresAt = attrs.ends_at ?? attrs.renews_at ?? null;

    await Promise.all([
      svc.from("users")
        .update({ plan_expires_at: planExpiresAt })
        .eq("id", userId),

      svc.from("subscriptions").upsert(
        {
          ls_subscription_id: lsSubId,
          user_id: userId,
          ls_variant_id: variantId,
          plan: PLAN_FOR_VARIANT[variantId] ?? "premium",
          status: "cancelled",
          renews_at: null,
          ends_at: attrs.ends_at ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "ls_subscription_id" }
      ),
    ]);

    return ok();
  }

  // ── Expiración: downgrade a free ──────────────────────────────────────────
  if (eventName === "subscription_expired") {
    if (!userId) return err("user_id faltante en custom_data");

    await Promise.all([
      svc.from("users")
        .update({ plan: "free", plan_expires_at: null })
        .eq("id", userId),

      svc.from("subscriptions").upsert(
        {
          ls_subscription_id: lsSubId,
          user_id: userId,
          ls_variant_id: variantId,
          plan: PLAN_FOR_VARIANT[variantId] ?? "premium",
          status: "expired",
          renews_at: null,
          ends_at: attrs.ends_at ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "ls_subscription_id" }
      ),
    ]);

    return ok();
  }

  // Otros eventos (order_created, etc.) — aceptar sin procesar
  return ok();
}
