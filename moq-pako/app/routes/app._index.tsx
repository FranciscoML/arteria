import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { shopify } from "~/shopify.server";
import { GET_PRODUCTS_WITH_TAGS } from "~/lib/shopify-queries";
import { parseMoqTags, extractMoqFromTags } from "~/lib/moq";

interface ProductEdge {
  node: {
    id: string;
    title: string;
    handle: string;
    tags: string[];
    variants: {
      edges: { node: { id: string; title: string; sku: string } }[];
    };
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await shopify.authenticate.admin(request);

  const allProducts: ProductEdge["node"][] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const response = await admin.graphql(GET_PRODUCTS_WITH_TAGS, {
      variables: {
        first: 50,
        after: cursor,
      },
    });

    const data = await response.json();
    const productsData = data.data?.products;

    if (!productsData) break;

    for (const edge of productsData.edges) {
      allProducts.push(edge.node);
    }

    hasNextPage = productsData.pageInfo.hasNextPage;
    cursor = productsData.pageInfo.endCursor;
  }

  const productsWithMoq = allProducts.map((product) => {
    const parsedTags = parseMoqTags(product.tags);
    const moq = extractMoqFromTags(product.tags);

    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      tags: product.tags,
      parsedTags,
      moq,
      variantCount: product.variants.edges.length,
    };
  });

  return json({
    shopName: session.shop,
    products: productsWithMoq,
    totalProducts: productsWithMoq.length,
    productsWithMoq: productsWithMoq.filter((p) => p.moq !== null).length,
  });
};

export default function AppDashboard() {
  const { shopName, products, totalProducts, productsWithMoq } =
    useLoaderData<typeof loader>();

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        <StatCard label="Total Productos" value={totalProducts} />
        <StatCard label="Con MOQ Configurado" value={productsWithMoq} />
        <StatCard label="Sin MOQ" value={totalProducts - productsWithMoq} />
      </div>

      <h2 style={{ fontSize: "18px", marginBottom: "16px" }}>
        Productos y sus MOQ
      </h2>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          background: "white",
          borderRadius: "8px",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}
      >
        <thead>
          <tr
            style={{
              background: "#f4f6f8",
              textAlign: "left",
              borderBottom: "1px solid #e1e3e5",
            }}
          >
            <th style={thStyle}>Producto</th>
            <th style={thStyle}>Handle</th>
            <th style={thStyle}>Tags MOQ</th>
            <th style={thStyle}>MOQ Mínimo</th>
            <th style={thStyle}>Variantes</th>
            <th style={thStyle}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr
              key={product.id}
              style={{ borderBottom: "1px solid #e1e3e5" }}
            >
              <td style={tdStyle}>{product.title}</td>
              <td style={tdStyle}>
                <code style={{ fontSize: "13px", color: "#6d7175" }}>
                  {product.handle}
                </code>
              </td>
              <td style={tdStyle}>
                {product.parsedTags.length > 0 ? (
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {product.parsedTags.map((tag) => (
                      <span
                        key={tag.raw}
                        style={{
                          background: "#e3f2fd",
                          color: "#1565c0",
                          padding: "2px 8px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: 500,
                        }}
                      >
                        {tag.raw} → {tag.minQuantity}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: "#999", fontSize: "13px" }}>
                    Sin tags MOQ
                  </span>
                )}
              </td>
              <td style={tdStyle}>
                {product.moq !== null ? (
                  <strong style={{ color: "#d32f2f", fontSize: "16px" }}>
                    {product.moq}
                  </strong>
                ) : (
                  <span style={{ color: "#999" }}>—</span>
                )}
              </td>
              <td style={tdStyle}>{product.variantCount}</td>
              <td style={tdStyle}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "4px 12px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: 500,
                    background: product.moq !== null ? "#e8f5e9" : "#fff3e0",
                    color: product.moq !== null ? "#2e7d32" : "#e65100",
                  }}
                >
                  {product.moq !== null ? "MOQ Activo" : "Sin MOQ"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {products.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "48px",
            color: "#6d7175",
            background: "white",
            borderRadius: "8px",
          }}
        >
          No se encontraron productos en la tienda.
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: "8px",
        padding: "20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}
    >
      <div style={{ fontSize: "28px", fontWeight: 700, color: "#1a1a2e" }}>
        {value}
      </div>
      <div style={{ fontSize: "14px", color: "#6d7175", marginTop: "4px" }}>
        {label}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#6d7175",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "14px",
  color: "#1a1a2e",
};
