import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { shopify } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } =
    await shopify.authenticate.webhook(request);

  console.log(`Received webhook: ${topic} for ${shop}`);

  switch (topic) {
    case "APP_UNINSTALLED":
      if (session) {
        // Clean up sessions for this shop
        console.log(`App uninstalled from ${shop}`);
      }
      break;

    case "PRODUCTS_CREATE":
    case "PRODUCTS_UPDATE":
      // When a product is created or updated, we could sync tags
      // The MOQ logic reads tags directly, so no sync needed
      console.log(`Product updated on ${shop}: ${payload?.id}`);
      break;

    default:
      console.log(`Unhandled webhook topic: ${topic}`);
  }

  return json({ received: true });
};

export const loader = async () => {
  return json({ status: "ok" });
};
