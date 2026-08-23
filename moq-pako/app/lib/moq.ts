export interface MoqTag {
  raw: string;
  minQuantity: number;
}

export interface ProductMoq {
  productId: string;
  handle: string;
  title: string;
  moq: number | null;
  tags: string[];
  parsedTags: MoqTag[];
}

export interface CartItem {
  merchandiseId: string;
  quantity: number;
  title?: string;
  productHandle?: string;
}

export interface CartValidationResult {
  valid: boolean;
  errors: CartValidationError[];
}

export interface CartValidationError {
  merchandiseId: string;
  title: string;
  currentQuantity: number;
  requiredMinimum: number;
  message: string;
}

const MOQ_TAG_PATTERN = /^min(\d+)$/i;

export function parseMoqTags(tags: string[]): MoqTag[] {
  const parsed: MoqTag[] = [];

  for (const tag of tags) {
    const trimmed = tag.trim();
    const match = trimmed.match(MOQ_TAG_PATTERN);

    if (match) {
      const minQuantity = parseInt(match[1], 10);

      if (minQuantity > 0) {
        parsed.push({
          raw: trimmed,
          minQuantity,
        });
      }
    }
  }

  return parsed;
}

export function extractMoqFromTags(tags: string[]): number | null {
  const parsed = parseMoqTags(tags);

  if (parsed.length === 0) {
    return null;
  }

  return Math.max(...parsed.map((t) => t.minQuantity));
}

export function validateCartItems(
  items: CartItem[],
  productMoqs: Map<string, number | null>
): CartValidationResult {
  const errors: CartValidationError[] = [];

  for (const item of items) {
    const moq = productMoqs.get(item.merchandiseId);
    const productHandle = item.productHandle || item.merchandiseId;

    if (moq !== null && moq !== undefined && item.quantity < moq) {
      errors.push({
        merchandiseId: item.merchandiseId,
        title: item.title || productHandle,
        currentQuantity: item.quantity,
        requiredMinimum: moq,
        message: `La cantidad mínima para "${item.title || productHandle}" es ${moq}. Actualmente tienes ${item.quantity}.`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
