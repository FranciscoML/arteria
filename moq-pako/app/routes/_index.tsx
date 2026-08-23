import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { shopify } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await shopify.authenticate.admin(request);

  if (session) {
    return redirect("/app");
  }

  return redirect("/auth/login");
};

export default function Index() {
  return null;
}
