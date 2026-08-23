import fs from "node:fs/promises";
import path from "node:path";
import { resolveShopLabel } from "~/config/shops.server";

export interface MoqEnforcerConfig {
  enabled: boolean;
  tagPattern: string;
  selectors: {
    cartForm: string;
    checkoutButton: string;
  };
  messages: {
    title: string;
    description: string;
  };
}

// Fallback absoluto — si la tienda no está registrada o el JSON no existe/está
// corrupto, el storefront igual queda protegido con este comportamiento base.
const DEFAULT_CONFIG: MoqEnforcerConfig = {
  enabled: true,
  tagPattern: "^min(\\d+)$",
  selectors: {
    cartForm: 'form[action="/cart"], [data-cart-form], .cart-items',
    checkoutButton:
      'button[name="checkout"], a[href="/checkout"], [data-checkout-button]',
  },
  messages: {
    title: "Minimum quantity required",
    description:
      "To continue, you must meet the minimum quantity requirement for this product.",
  },
};

const CONFIG_DIR = path.resolve(process.cwd(), "app/config");

function mergeConfig(
  overrides: Partial<MoqEnforcerConfig> | null,
): MoqEnforcerConfig {
  if (!overrides) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    selectors: { ...DEFAULT_CONFIG.selectors, ...overrides.selectors },
    messages: { ...DEFAULT_CONFIG.messages, ...overrides.messages },
  };
}

/**
 * Lee app/config/moq-enforcer.<label>.json para la tienda dada, resolviendo
 * el label vía SHOP_REGISTRY (mismo mecanismo que collections.<label>.json).
 *
 * Se lee de disco en cada llamada — los archivos son de pocos KB, así que el
 * costo es despreciable, y a cambio ajustar selectores/enabled/mensajes de
 * una tienda no requiere redeploy: solo editar el JSON.
 */
export async function getMoqEnforcerConfig(
  shopDomain: string | null,
): Promise<MoqEnforcerConfig> {
  const label = resolveShopLabel(shopDomain);

  if (!label) {
    console.warn(
      `MOQ config: tienda "${shopDomain}" no está en SHOP_REGISTRY, usando defaults.`,
    );
    return DEFAULT_CONFIG;
  }

  const filePath = path.join(CONFIG_DIR, `moq-enforcer.${label}.json`);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return mergeConfig(parsed);
  } catch (error) {
    console.warn(
      `MOQ config: no se pudo leer ${filePath} (${(error as Error).message}), usando defaults.`,
    );
    return DEFAULT_CONFIG;
  }
}
