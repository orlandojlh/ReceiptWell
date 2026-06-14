import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createLemonCheckout, type VariantKey } from "@/lib/lemon";

const VALID_VARIANTS = new Set<VariantKey>(["mensual", "anual", "founding"]);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let variantKey: VariantKey;
  try {
    const body = await request.json() as { variant?: string };
    if (!body.variant || !VALID_VARIANTS.has(body.variant as VariantKey)) {
      return NextResponse.json({ error: "Variante inválida" }, { status: 400 });
    }
    variantKey = body.variant as VariantKey;
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  try {
    const url = await createLemonCheckout(variantKey, user.id, user.email ?? "");
    return NextResponse.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[checkout] error:", msg);
    return NextResponse.json({ error: "Error al crear el checkout" }, { status: 500 });
  }
}
