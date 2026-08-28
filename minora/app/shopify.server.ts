import "@shopify/shopify-app-remix/advisorisk";
import { LATEST_API_VERSION, LogSeverity } from "@shopify/shopify-api";
import { ShopifyApp } from "@shopify/shopify-app-remix";

export const shopify = ShopifyApp({
  api: {
    apiKey: process.env.SHOPIFY_API_KEY!,
    apiSecretKey: process.env.SHOPIFY_API_SECRET!,
    scopes: ["read_products", "write_products", "read_checkouts", "write_checkouts"],
    hostName: process.env.SHOPIFY_APP_URL!.replace(/https:\/\//, ""),
    apiVersion: LATEST_API_VERSION,
  },
  auth: {
    path: "/auth",
    loginPath: "/auth/login",
    callbackPath: "/auth/callback",
    sessionAlias: "shopify-session",
  },
  webhooks: {
    path: "/webhooks",
  },
  sessions: {
    storage: {
      storeCallback: async (session) => {
        // In production, use a database. Here we use an in-memory store.
        if (!globalThis.__SESSIONS) {
          globalThis.__SESSIONS = new Map();
        }
        globalThis.__SESSIONS.set(session.id, session);
      },
      loadCallback: async (id) => {
        if (!globalThis.__SESSIONS) {
          globalThis.__SESSIONS = new Map();
        }
        return globalThis.__SESSIONS.get(id) || undefined;
      },
      deleteCallback: async (id) => {
        if (!globalThis.__SESSIONS) {
          globalThis.__SESSIONS = new Map();
        }
        globalThis.__SESSIONS.delete(id);
      },
    },
  },
  logger: {
    level: LogSeverity.Info,
    log: (severity, message) => {
      console.log(`[${severity}] ${message}`);
    },
  },
});

declare global {
  var __SESSIONS: Map<string, any>;
}
