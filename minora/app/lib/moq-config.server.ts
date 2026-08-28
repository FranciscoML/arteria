import fs from "node:fs/promises";
import path from "node:path";
import { resolveShopLabel } from "~/config/shops.server";
import { getMoqEnforcerConfig } from "~/lib/moq-enforcer-config.server";

export interface MoqCheckoutConfig {
  tagPatternSource: string;
  defaultMoq: number;
  moqBannerTitle: string;
  minBadgeLabel: string;
  currentBadgeLabel: string;
  permissionBannerTitle: string;
  permissionBannerText: string;
  blockProgressReason: string;
}

// Nota: tagPatternSource NO se declara aquí — siempre viene de
// moq-enforcer.<label>.json, para tener una única fuente de verdad
// compartida entre el script del carrito y el checkout.
const DEFAULT_CONFIG: Omit<MoqCheckoutConfig, "tagPatternSource"> = {
  defaultMoq: 1,
  moqBannerTitle: "Cantidad Mínima Requerida",
  minBadgeLabel: "Min:",
  currentBadgeLabel: "Actual:",
  permissionBannerTitle: "Permiso pendiente",
  permissionBannerText:
    "Esta app puede mostrar advertencias pero no bloquear el checkout. Actívalo en Configuración → Checkout → Apps.",
  blockProgressReason: "Cantidad mínima de pedido no cumplida",
};

const CONFIG_DIR = path.resolve(process.cwd(), "app/config");

export async function getMoqCheckoutConfig(
  shopDomain: string | null,
): Promise<MoqCheckoutConfig> {
  const label = resolveShopLabel(shopDomain);

  // Reutiliza el mismo loader del cart-enforcer: así el tagPattern nunca
  // se desincroniza entre ambos sistemas.
  const enforcerConfig = await getMoqEnforcerConfig(shopDomain);

  if (!label) {
    console.warn(
      `MOQ checkout config: tienda "${shopDomain}" no está en SHOP_REGISTRY, usando defaults.`,
    );
    return { ...DEFAULT_CONFIG, tagPatternSource: enforcerConfig.tagPattern };
  }

  const filePath = path.join(CONFIG_DIR, `moq-config.${label}.json`);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      tagPatternSource: enforcerConfig.tagPattern,
    };
  } catch (error) {
    console.warn(
      `MOQ checkout config: no se pudo leer ${filePath} (${(error as Error).message}), usando defaults.`,
    );
    return { ...DEFAULT_CONFIG, tagPatternSource: enforcerConfig.tagPattern };
  }
}
