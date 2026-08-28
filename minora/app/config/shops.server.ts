/**
 * Registro central de tiendas.
 *
 * Mapea el dominio real .myshopify.com de cada tienda a un "label" corto,
 * usado para nombrar TODOS sus archivos de configuración por tienda
 * (collections.<label>.json, moq-enforcer.<label>.json, etc.) — así todo el
 * sistema de config-por-tienda usa la misma convención de nombres.
 *
 * Agregar una tienda nueva = agregar una línea aquí + sus archivos JSON
 * correspondientes en app/config/.
 */
export const SHOP_REGISTRY: Record<string, string> = {
  "fcostore-xczn8tfp.myshopify.com": "dev",
  "aea6eb-86.myshopify.com": "client",

  // Descomenta y ajusta cuando tengas el dominio real del cliente:
  // "nombre-real-cliente.myshopify.com": "client",
};

export function resolveShopLabel(shopDomain: string | null): string | null {
  if (!shopDomain) return null;
  return SHOP_REGISTRY[shopDomain] ?? null;
}
