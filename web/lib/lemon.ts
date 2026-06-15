import { lemonSqueezySetup, createCheckout } from "@lemonsqueezy/lemonsqueezy.js";

export type VariantKey = "mensual" | "anual" | "founding";

const VARIANT_IDS: Record<VariantKey, string> = {
  mensual:  process.env.LEMONSQUEEZY_VARIANT_MENSUAL!,
  anual:    process.env.LEMONSQUEEZY_VARIANT_ANUAL!,
  founding: process.env.LEMONSQUEEZY_VARIANT_FOUNDING!,
};

// plan que se asigna a cada variante en la tabla users
export const PLAN_FOR_VARIANT: Record<string, "premium" | "founding"> = {
  [process.env.LEMONSQUEEZY_VARIANT_MENSUAL!]:  "premium",
  [process.env.LEMONSQUEEZY_VARIANT_ANUAL!]:    "premium",
  [process.env.LEMONSQUEEZY_VARIANT_FOUNDING!]: "founding",
};

function setup() {
  lemonSqueezySetup({ apiKey: process.env.LEMONSQUEEZY_API_KEY! });
}

export async function createLemonCheckout(
  variantKey: VariantKey,
  userId: string,
  userEmail: string
): Promise<string> {
  setup();

  const variantId = VARIANT_IDS[variantKey];
  if (!variantId) throw new Error(`Variante desconocida: ${variantKey}`);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { data, error } = await createCheckout(
    process.env.NEXT_PUBLIC_LEMON_STORE_ID!,
    variantId,
    {
      checkoutData: {
        email: userEmail,
        custom: { user_id: userId },
      },
      productOptions: {
        redirectUrl: `${appUrl}/dashboard?upgrade=success`,
        receiptButtonText: "Ir a mi dashboard",
        receiptLinkUrl: `${appUrl}/dashboard`,
      },
    }
  );

  if (error || !data?.data?.attributes?.url) {
    console.error("[lemon] createCheckout error:", error);
    throw new Error("No se pudo crear el checkout de Lemon Squeezy");
  }

  return data.data.attributes.url;
}
