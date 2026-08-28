import type { LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { shopify } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, redirect } = await shopify.authenticate.admin(request);

  return {
    shopName: session.shop,
    apiKey: process.env.SHOPIFY_API_KEY,
  };
};

export default function AppLayout() {
  const { shopName } = useLoaderData<typeof loader>();

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 0 }}>
      <header
        style={{
          background: "#1a1a2e",
          color: "white",
          padding: "16px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>
          MOQ Pako
        </h1>
        <span style={{ fontSize: "14px", opacity: 0.7 }}>{shopName}</span>
      </header>
      <main style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
