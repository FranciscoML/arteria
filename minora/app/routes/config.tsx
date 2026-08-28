import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getMoqCheckoutConfig } from "~/lib/moq-config.server";

// Publica a proposito: la llama la extension de checkout desde el navegador
// del comprador, en el dominio del checkout (cross-origin).
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  const config = await getMoqCheckoutConfig(shop);

  return json(config, {
    headers: {
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
