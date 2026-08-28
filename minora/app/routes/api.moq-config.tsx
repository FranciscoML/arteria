import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getMoqEnforcerConfig } from "~/lib/moq-enforcer-config.server";

/**
 * Sirve la configuracion del MOQ Enforcer por tienda.
 *
 * Publica a proposito (sin shopify.authenticate): el storefront de cada
 * tienda la llama directamente desde el navegador del comprador, antes de
 * cualquier login. No debe devolver nada sensible - solo selectores CSS,
 * patron de tag y textos.
 *
 * La config real vive en app/config/moq-enforcer.<label>.json - ver
 * app/lib/moq-enforcer-config.server.ts y app/config/shops.server.ts.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  const config = await getMoqEnforcerConfig(shop);

  return json(config, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
