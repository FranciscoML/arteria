/**
 * MOQ Pako
 *
 */

(function () {
  "use strict";

  const MOQ_APP_URL = "https://agencyarteria.com/minora";
  const MOQ_TAG_PATTERN = /^min(\d+)$/i;
  const VALIDATION_DEBOUNCE_MS = 300;

  /**
   * Extrae el MOQ de los tags de un producto
   */
  function extractMoqFromTags(tags) {
    let maxMoq = 0;
    for (const tag of tags) {
      const match = tag.trim().match(MOQ_TAG_PATTERN);
      if (match) {
        const val = parseInt(match[1], 10);
        if (val > maxMoq) maxMoq = val;
      }
    }
    return maxMoq > 0 ? maxMoq : null;
  }

  /**
   * Parsea los tags de Shopify.
   * /products/{handle}.js devuelve "tags" como ARRAY de strings, no como
   * string separado por comas — por eso soportamos ambos formatos aquí.
   */
  function parseTags(tags) {
    if (!tags) return [];
    if (Array.isArray(tags)) return tags.map((t) => String(t).trim());
    return String(tags)
      .split(",")
      .map((t) => t.trim());
  }

  /**
   * Agrega un banner de advertencia al carrito.
   * Devuelve true si el banner cambió (se insertó/actualizó), false si no
   * hizo falta tocar el DOM — así evitamos mutaciones innecesarias que
   * retriggerean el MutationObserver.
   */
  function showMoqWarning(productTitles, required, current) {
    const existing = document.querySelector("[data-moq-warning-handle]");

    if (existing) {
      existing.remove();
    }

    const banner = document.createElement("div");

    banner.setAttribute("data-moq-warning-handle", "true");

    banner.style.cssText = `
    width: 100%;
    box-sizing: border-box;

    background: #fff8e1;
    border: 1px solid #f4c84a;
    border-radius: 10px;

    padding: 14px;
    margin: 12px 0 16px;

    color: #5c4500;

    font-family:
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      Roboto,
      Helvetica,
      Arial,
      sans-serif;

    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  `;

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    const titlesHtml = Array.isArray(productTitles)
      ? productTitles
          .map(
            (t) =>
              `<div style="font-size: 13px;line-height: 18px;font-weight: 600;color: #3f3100;white-space: nowrap;overflow: hidden;text-overflow: ellipsis;" title="${escapeHtml(t)}">${escapeHtml(t)}</div>`,
          )
          .join("")
      : `<div style="font-size: 13px;line-height: 18px;font-weight: 600;color: #3f3100;white-space: nowrap;overflow: hidden;text-overflow: ellipsis;" title="${escapeHtml(String(productTitles))}">${escapeHtml(String(productTitles))}</div>`;

    const remaining = Math.max(required - current, 0);

    banner.innerHTML = `
    <!-- Header -->
    <div style="display: flex; align-items: flex-start; gap: 10px;">
      <!-- Warning Icon -->
      <div style="width: 30px;height: 30px;min-width: 30px;display: flex;align-items: center;justify-content: center;background: #fff0b8;border: 1px solid #f4c84a;border-radius: 50%;color: #a66a00;">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12 3L22 20H2L12 3Z" fill="currentColor"/>
          <path d="M12 9V13" stroke="white" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="16.5" r="1" fill="white"/>
        </svg>
      </div>

      <!-- Message -->
      <div style="flex: 1; min-width: 0;">
        <div style="font-size: 14px;line-height: 20px;font-weight: 700;color: #5c4500;margin-bottom: 3px;">
          Minimum quantity required
        </div>
        <div style="font-size: 13px;line-height: 18px;color: #725900;">
          To continue, you must meet the minimum quantity requirement for this product. You can combine different colors/variants to reach the minimum.
        </div>
      </div>
    </div>

    <!-- Product / MOQ information -->
    <div style="display: flex;align-items: center;justify-content: space-between;gap: 10px;margin-top: 12px;padding: 10px 12px;background: rgba(255, 255, 255, 0.65);border: 1px solid #f3d77a;border-radius: 8px;">

      <!-- Product -->
      <div style="min-width: 0;flex: 1;">
        ${titlesHtml}
        <div style="margin-top: 2px;font-size: 12px;line-height: 17px;color: #7a650f;">
          Minimum required:
          <strong>${required} units</strong>
        </div>
      </div>

      <!-- Current quantity -->
      <div style="flex-shrink: 0;padding: 5px 9px;background: #fff0bd;border: 1px solid #f0cc5b;border-radius: 999px;font-size: 12px;line-height: 16px;font-weight: 600;color: #8a5b00;white-space: nowrap;">
        Actual: ${current}
      </div>
    </div>

    <!-- Remaining -->
    <div style="margin-top: 9px; font-size: 12px; line-height: 16px; color: #806a16;">
      You are <strong style="color: #6b4d00;">${remaining} ${remaining === 1 ? "unit" : "units"}</strong> away from the minimum.
    </div>
  `;

    // Find cart container
    const cartForm =
      document.querySelector('form[action="/cart"]') ||
      document.querySelector("[data-cart-form]") ||
      document.querySelector(".cart-items");

    // Insert warning at the beginning of cart
    if (cartForm) {
      cartForm.prepend(banner);
    }
  }

  /**
   * Bloquea el botón de checkout si hay errores MOQ
   */
  function disableCheckout() {
    const checkoutBtn = document.querySelector(
      'button[name="checkout"], a[href="/checkout"], [data-checkout-button]',
    );
    if (checkoutBtn) {
      checkoutBtn.style.opacity = "0.5";
      checkoutBtn.style.pointerEvents = "none";
      checkoutBtn.title =
        "No puedes proceder al checkout porque algunos productos no cumplen la cantidad mínima.";
    }
  }

  /**
   * Habilita el botón de checkout
   */
  function enableCheckout() {
    const checkoutBtn = document.querySelector(
      'button[name="checkout"], a[href="/checkout"], [data-checkout-button]',
    );
    if (checkoutBtn) {
      checkoutBtn.style.opacity = "1";
      checkoutBtn.style.pointerEvents = "auto";
      checkoutBtn.title = "";
    }
  }

  /**
   * Ajusta el atributo "min" del input de cantidad correspondiente a un
   * item del carrito, si existe en el DOM. Aislado en su propio try/catch
   * para que un selector inesperado nunca aborte el resto de la validación.
   */
  function trySetQuantityInputMin(item, moq) {
    try {
      const safeKey = CSS.escape(item.key);
      // Solo construimos selectores por VALOR de atributo (entre comillas),
      // nunca concatenando item.key dentro del NOMBRE del atributo — eso es
      // lo que rompía el selector cuando item.key contenía ":".
      const quantityInput = document.querySelector(
        `input[name="updates[${safeKey}]"]`,
      );
      if (quantityInput) {
        quantityInput.min = moq;
      }
    } catch (selectorError) {
      console.warn(
        "MOQ: no se pudo ajustar el input de cantidad",
        selectorError,
      );
    }
  }

  /**
   * Función principal de validación
   * Usa la API de Shopify para obtener los tags de los productos del carrito
   */
  async function validateCartMoq() {
    try {
      const cartResponse = await fetch("/cart.js");
      if (!cartResponse.ok) return;

      const cart = await cartResponse.json();
      if (!cart.items || cart.items.length === 0) {
        enableCheckout();
        document
          .querySelectorAll("[data-moq-warning-handle]")
          .forEach((el) => el.remove());
        return;
      }

      const productHandles = cart.items.map(
        (item) => item.handle || item.product_handle,
      );

      const productTagsMap = {};

      for (const handle of productHandles) {
        if (productTagsMap[handle]) continue;

        try {
          const response = await fetch(`/products/${handle}.js`);
          if (response.ok) {
            const product = await response.json();
            productTagsMap[handle] = parseTags(product.tags || "");
          } else {
            productTagsMap[handle] = [];
          }
        } catch {
          productTagsMap[handle] = [];
        }
      }

      let hasError = false;

      // Remove old warnings antes de recalcular
      document
        .querySelectorAll("[data-moq-warning-handle]")
        .forEach((el) => el.remove());

      // Agrupar líneas del carrito por producto (product_id). Variantes de un
      // mismo producto comparten product_id (ej. mismo producto en distintos
      // colores), de modo que sus cantidades se suman para cumplir el MOQ.
      const productGroups = {};
      for (const item of cart.items) {
        const handle = item.handle || item.product_handle;
        if (!handle) continue;

        if (!productGroups[handle]) {
          productGroups[handle] = {
            titles: [],
            totalQuantity: 0,
            moq: extractMoqFromTags(productTagsMap[handle] || []),
            keys: [],
          };
        }
        const group = productGroups[handle];
        group.titles.push(item.title);
        group.totalQuantity += item.quantity;
        group.keys.push(item.key);
      }

      for (const handle of Object.keys(productGroups)) {
        const group = productGroups[handle];
        if (group.moq !== null && group.totalQuantity < group.moq) {
          hasError = true;
          showMoqWarning(group.titles, group.moq, group.totalQuantity);
          for (const key of group.keys) {
            trySetQuantityInputMin({ key }, group.moq);
          }
        }
      }

      if (hasError) {
        disableCheckout();
      } else {
        enableCheckout();
      }
    } catch (error) {
      console.error("MOQ validation error:", error);
    }
  }

  /**
   * Inicializar observador de cambios en el carrito
   */
  function init() {
    let isValidating = false;
    let debounceTimer = null;

    async function runValidation() {
      if (isValidating) return;
      isValidating = true;
      try {
        await validateCartMoq();
      } finally {
        isValidating = false;
      }
    }

    function scheduleValidation() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runValidation, VALIDATION_DEBOUNCE_MS);
    }

    // Validate on page load (sin debounce, queremos feedback inmediato)
    runValidation();

    // Observe cart changes — con debounce + guard para evitar el bucle
    // infinito que se generaba porque insertar/remover el propio banner
    // disparaba nuevas mutaciones del DOM.
    const observer = new MutationObserver(() => {
      scheduleValidation();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Listen for cart AJAX updates
    document.addEventListener("cart:change", scheduleValidation);
    document.addEventListener("cart:refresh", scheduleValidation);

    // Intercept fetch/XHR for cart updates
    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      const result = originalFetch.apply(this, args);
      if (args[0] && typeof args[0] === "string") {
        if (
          args[0].includes("/cart/add") ||
          args[0].includes("/cart/update") ||
          args[0].includes("/cart/change")
        ) {
          result.then(() => setTimeout(scheduleValidation, 100));
        }
      }
      return result;
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
