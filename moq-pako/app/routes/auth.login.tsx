import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { shopify } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await shopify.authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await shopify.authenticate.admin(request);

  // Use this for OAuth login flow
  return null;
};
