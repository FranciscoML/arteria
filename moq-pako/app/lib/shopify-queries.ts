export const GET_PRODUCTS_WITH_TAGS = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          tags
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                price {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const GET_PRODUCT_BY_HANDLE = `
  query GetProductByHandle($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
      handle
      tags
      variants(first: 100) {
        edges {
          node {
            id
            title
            sku
            price {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

export const GET_PRODUCT_BY_ID = `
  query GetProductById($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      tags
      variants(first: 100) {
        edges {
          node {
            id
            title
            sku
            price {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

export const GET_PRODUCT_METAFIELDS = `
  query GetProductMetafields($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      tags
      metafields(identifiers: [
        { namespace: "moq", key: "min_quantity" }
      ]) {
        id
        namespace
        key
        value
      }
    }
  }
`;
