/**
 * MOQ Pako
 *
 * Corre en el storefront de cada tienda. Los selectores y textos NO estan
 * hardcodeados: se leen de la config por tienda via app proxy
 * (`/apps/minora/api/moq-config` -> GET /api/moq-config?shop=<dominio>), que a
 * su vez lee `app/config/moq-enforcer.<label>.json`. Asi, adaptar el script al
 * tema de una tienda nueva es editar un JSON, sin recompilar ni re-subir el
 * asset.
 *
 * OJO: `/apps/minora/config` NO es esta config — esa ruta la consume la
 * extension de checkout (`moq-config.<label>.json`). Cada consumidor tiene su
 * propia ruta.
 */

(function () {
  "use strict";

  const APP_PROXY_CONFIG_PATH = "/apps/minora/api/moq-config";
  const CONFIG_TIMEOUT_MS = 2000;
  const VALIDATION_DEBOUNCE_MS = 300;
  const BLOCKED_MARKER = "data-moq-blocked";
  const BANNER_ATTR = "data-moq-warning-handle";
  const BANNER_SELECTOR = `[${BANNER_ATTR}]`;

  const DEFAULT_CONFIG = {
    enabled: true,
    tagPattern: "^min(\\d+)$",
    selectors: {
      cartForm:
        'form[action="/cart"], [data-cart-form], .cart-items, .cart-drawer, [data-cart-drawer], .cart-drawer__content, .cart-drawer__wrapper, .mini-cart, [data-mini-cart], .cart-popup, #cart-drawer, [data-drawer="cart"], .cart__container, .cart__contents, .drawer__content',
      // Contenedor(es) donde se inserta el banner. Vacio = heuristico legacy
      // (primer contenedor visible de `cartForm`). Si una tienda define esta
      // lista, el banner va a TODOS los elementos que coincidan, lo que permite
      // mostrarlo a la vez en el drawer y en la pagina /cart.
      warningBanner: "",
      // Si el contenedor tiene un hijo directo que coincide con este selector,
      // el banner se inserta DESPUES de el (p. ej. ".drawer-header"). Si no, prepend.
      warningBannerAfter: "",
      checkoutButton:
        'button[name="checkout"], a[href="/checkout"], [data-checkout-button]',
      // OJO: no usar `a[href="/cart"]` aqui. En la mayoria de temas ese es el
      // icono del header que ABRE el drawer; bloquearlo deja el carrito
      // inaccesible. El boton "Ver carrito" se detecta por texto, mas abajo.
      cartViewButton: ".cart-view-button, [data-view-cart], .cart__view-button",
    },
    messages: {
      title: "Minimum quantity required",
      description:
        "To continue, you must meet the minimum quantity requirement for this product.",
      blockedActionTitle:
        "No puedes proceder porque algunos productos no cumplen la cantidad minima.",
    },
  };

  let config = DEFAULT_CONFIG;
  let configPromise = null;
  /** Firma del estado ya pintado: evita reescribir el DOM si nada cambio. */
  let renderedStateKey = null;
  /** true mientras el propio script muta el DOM (ver withSelfMutations). */
  let ignoreMutations = false;

  /**
   * Merge superficial defensivo: solo acepta claves del shape conocido y con el
   * tipo esperado, para que un JSON mal editado no rompa el storefront.
   */
  function mergeConfig(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      return DEFAULT_CONFIG;

    const merged = {
      ...DEFAULT_CONFIG,
      enabled:
        typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_CONFIG.enabled,
      selectors: { ...DEFAULT_CONFIG.selectors },
      messages: { ...DEFAULT_CONFIG.messages },
    };

    if (typeof raw.tagPattern === "string") {
      try {
        new RegExp(raw.tagPattern);
        merged.tagPattern = raw.tagPattern;
      } catch {
        /* patron invalido: se conserva el default */
      }
    }

    for (const key of Object.keys(DEFAULT_CONFIG.selectors)) {
      if (typeof raw.selectors?.[key] === "string") {
        merged.selectors[key] = raw.selectors[key];
      }
    }

    for (const key of Object.keys(DEFAULT_CONFIG.messages)) {
      if (typeof raw.messages?.[key] === "string") {
        merged.messages[key] = raw.messages[key];
      }
    }

    return merged;
  }

  /**
   * Descarga la config de la tienda una sola vez y la cachea. Si falla
   * (app no instalada, timeout, offline) el storefront queda con los defaults.
   */
  function loadConfig() {
    if (configPromise) return configPromise;

    configPromise = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);

        const response = await fetch(APP_PROXY_CONFIG_PATH, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });

        clearTimeout(timer);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        config = mergeConfig(await response.json());
      } catch (error) {
        console.warn(
          "[moq] config por tienda no disponible, usando defaults:",
          error,
        );
        config = DEFAULT_CONFIG;
      }

      return config;
    })();

    return configPromise;
  }

  /**
   * Extrae el MOQ de los tags de un producto
   */
  function extractMoqFromTags(tags) {
    let maxMoq = 0;
    for (const tag of tags) {
      const match = String(tag)
        .trim()
        .match(new RegExp(config.tagPattern, "i"));
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

  function queryAll(selector) {
    if (!selector) return [];
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch (e) {
      console.warn("[moq] selector invalido:", selector, e);
      return [];
    }
  }

  /**
   * Busca posibles contenedores del carrito (página y preview/drawer)
   */
  function findCartContainers() {
    const found = queryAll(config.selectors.cartForm);
    return Array.from(new Set(found));
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function isVisible(el) {
    if (typeof el.getClientRects === "function") {
      return el.getClientRects().length > 0;
    }
    return el.offsetParent !== null;
  }

  /**
   * Contenedores donde debe caer el banner.
   *
   * - Con `selectors.warningBanner` definido por la tienda: exactamente los
   *   elementos que coincidan. Es la via para fijar donde va el banner sin
   *   depender del orden del DOM.
   * - Sin ese selector: heuristico legacy, el primer contenedor visible de
   *   `cartForm` (o el primero que exista).
   */
  function insertBanner(target, banner) {
    const afterSel = config.selectors.warningBannerAfter;
    if (afterSel) {
      try {
        const anchor = Array.from(target.children).find((child) =>
          child.matches(afterSel),
        );
        if (anchor) {
          anchor.after(banner);
          return;
        }
      } catch (e) {
        console.warn("[moq] selector invalido:", afterSel, e);
      }
    }
    target.prepend(banner);
  }

  function findBannerTargets() {
    const bannerSelector = config.selectors.warningBanner;
    if (bannerSelector) return queryAll(bannerSelector);

    const containers = findCartContainers();
    const target = containers.find(isVisible) || containers[0];
    return target ? [target] : [];
  }

  /**
   * Ejecuta escrituras del propio script sin que el MutationObserver las vea.
   * Sin esto, insertar/remover el banner dispara el observer, que dispara otra
   * validacion, que vuelve a escribir... y el banner parpadea en bucle
   * indefinido (con el fetch de /cart.js en cada vuelta).
   */
  function withSelfMutations(fn) {
    ignoreMutations = true;
    try {
      fn();
    } finally {
      // El observer se entrega en un microtask encolado ANTES que este, asi
      // que cuando se ejecuta todavia ve ignoreMutations === true.
      queueMicrotask(() => {
        ignoreMutations = false;
      });
    }
  }

  function isBannerOnlyMutation(record) {
    const nodes = Array.from(record.addedNodes).concat(
      Array.from(record.removedNodes),
    );
    if (nodes.length === 0) return false;
    return nodes.every(
      (node) => node.nodeType === 1 && node.hasAttribute(BANNER_ATTR),
    );
  }

  function removeMoqBanners() {
    document.querySelectorAll(BANNER_SELECTOR).forEach((el) => el.remove());
  }

  function clearMoqWarnings() {
    withSelfMutations(() => {
      renderedStateKey = null;
      removeMoqBanners();
    });
  }

  /**
   * Pinta un banner (sin insertarlo todavia) para un producto que incumple.
   */
  function buildMoqBanner(productTitles, required, current) {
    const banner = document.createElement("div");

    banner.setAttribute(BANNER_ATTR, "true");

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

    const titles = Array.isArray(productTitles)
      ? productTitles
      : [productTitles];
    const titlesHtml = titles
      .map(
        (t) =>
          `<div style="font-size: 13px;line-height: 18px;font-weight: 600;color: #3f3100;white-space: nowrap;overflow: hidden;text-overflow: ellipsis;" title="${escapeHtml(t)}">${escapeHtml(t)}</div>`,
      )
      .join("");

    const remaining = Math.max(required - current, 0);
    const description = config.messages.description;
    const extraNote = description.includes("You can combine")
      ? " You can combine different colors/variants to reach the minimum."
      : "";

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
          ${escapeHtml(config.messages.title)}
        </div>
        <div style="font-size: 13px;line-height: 18px;color: #725900;">
          ${escapeHtml(description + extraNote)}
        </div>
      </div>
    </div>

    <!-- Product / MOQ information -->
    <div style="display: flex;align-items: center;justify-content: space-between;gap: 10px;margin-top: 12px;padding: 10px 12px;background: rgba(255, 255, 255, 0.65);border: 1px solid #f3d77a;border-radius: 8px;">

      <!-- Product -->
      <div style="min-width: 0;flex: 1;">
        ${titlesHtml}
        <div style="margin-top: 2px;font-size: 12px;line-height: 17px;color: #7a650f;">
          ${escapeHtml(config.messages.title)}: <strong>${required}</strong>
        </div>
      </div>

      <!-- Current quantity -->
      <div style="flex-shrink: 0;padding: 5px 9px;background: #fff0bd;border: 1px solid #f0cc5b;border-radius: 999px;font-size: 12px;line-height: 16px;font-weight: 600;color: #8a5b00;white-space: nowrap;">
        Actual: ${current}
      </div>
    </div>

    <!-- Remaining -->
    <div style="margin-top: 9px; font-size: 12px; line-height: 16px; color: #806a16;">
      Faltan <strong style="color: #6b4d00;">${remaining} ${remaining === 1 ? "unidad" : "unidades"}</strong> para alcanzar el minimo.
    </div>
  `;

    return banner;
  }

  /**
   * Inserta un banner por cada producto que incumple el MOQ, en cada
   * contenedor configurado.
   *
   * Es idempotente a proposito: si el estado (productos, minimo, cantidad) es
   * el mismo que ya esta pintado y los banners siguen en su sitio, no se toca
   * el DOM. Sin esta guarda, quitar+volver a pintar el banner en cada
   * validacion se realimenta via MutationObserver y el banner parpadea para
   * siempre (y arrastra un fetch de /cart.js por vuelta).
   */
  function renderMoqWarnings(errors) {
    const stateKey = JSON.stringify([config.messages, errors]);
    const containers = findBannerTargets();
    const targets = containers.length ? containers : [document.body];

    const expected = errors.length * targets.length;
    const placed = document.querySelectorAll(BANNER_SELECTOR).length;
    const allInPlace =
      errors.length === 0 ||
      targets.every((el) => el.querySelector(BANNER_SELECTOR));

    if (stateKey === renderedStateKey && placed === expected && allInPlace) {
      return;
    }

    const banners = errors.map((error) =>
      buildMoqBanner(error.titles, error.required, error.current),
    );

    withSelfMutations(() => {
      renderedStateKey = stateKey;
      removeMoqBanners();
      for (const target of targets) {
        for (const banner of banners) {
          insertBanner(target, banner.cloneNode(true));
        }
      }
    });
  }

  /**
   * Ultimo recurso para el boton "Ver carrito": muchos themes lo renderizan
   * con clases propias y sin data-attributes, asi que lo detectamos por texto
   * o aria-label.
   *
   * "carrito"/"carro" no contienen "cart", asi que el stem es /car(t|r)/ y no
   * \bcart\b. French usa "panier". Se evalua SOLO dentro de los contenedores de
   * carrito, para no capturar por error el toggle del header ("Carrito") que
   * abre el drawer — ese debe seguir funcionando.
   */
  const CART_WORD_RE = /\bcar(?:t|r)|\bpanier/i;
  const ACTION_WORD_RE = /\b(view|ver|voir|ver|mostrar|go|ir|see)\b/i;

  function findViewCartButtonsByText() {
    const found = [];

    findCartContainers().forEach((container) => {
      container.querySelectorAll("a, button").forEach((el) => {
        if (el.hasAttribute(BLOCKED_MARKER)) return;
        // Skip togglers: dentro de un drawer suelen ser pestanas/filtros, no el
        // enlace al carrito.
        if (
          el.hasAttribute("aria-controls") ||
          el.hasAttribute("aria-expanded")
        )
          return;

        const label = `${el.textContent || ""} ${
          el.getAttribute("aria-label") || ""
        }`.trim();

        if (ACTION_WORD_RE.test(label) && CART_WORD_RE.test(label)) {
          found.push(el);
        }
      });
    });

    return found;
  }

  /**
   * Devuelve todos los botones de accion del carrito (Checkout y Ver carrito),
   * combinando los selectores de la config con la deteccion por texto.
   */
  function collectActionButtons() {
    const buttons = [
      ...queryAll(config.selectors.checkoutButton),
      ...queryAll(config.selectors.cartViewButton),
      ...findViewCartButtonsByText(),
    ];
    return Array.from(new Set(buttons));
  }

  /**
   * Deshabilita todos los botones de accion del carrito (Checkout y
   * View Cart) cuando hay errores MOQ. Marca cada elemento con
   * data-moq-blocked para poder restaurar exactamente lo que toco este
   * script, sin pisar el estilo propio del theme.
   */
  function disableActionButtons() {
    collectActionButtons().forEach((el) => {
      if (el.hasAttribute(BLOCKED_MARKER)) return;
      el.setAttribute(BLOCKED_MARKER, "true");
      el.dataset.moqPrevOpacity = el.style.opacity || "";
      el.dataset.moqPrevPointerEvents = el.style.pointerEvents || "";
      el.style.opacity = "0.5";
      el.style.pointerEvents = "none";
      el.setAttribute("title", config.messages.blockedActionTitle);
      el.setAttribute("aria-disabled", "true");
      if (el.tagName === "BUTTON") {
        el.dataset.moqPrevDisabled = el.disabled ? "1" : "";
        el.disabled = true;
      }
    });
  }

  /**
   * Habilita todos los botones de accion del carrito (Checkout y View Cart)
   */
  function enableActionButtons() {
    document.querySelectorAll(`[${BLOCKED_MARKER}]`).forEach((el) => {
      el.removeAttribute(BLOCKED_MARKER);

      if (el.dataset.moqPrevOpacity)
        el.style.opacity = el.dataset.moqPrevOpacity;
      else el.style.removeProperty("opacity");

      if (el.dataset.moqPrevPointerEvents)
        el.style.pointerEvents = el.dataset.moqPrevPointerEvents;
      else el.style.removeProperty("pointer-events");

      el.removeAttribute("title");
      el.removeAttribute("aria-disabled");
      if (el.tagName === "BUTTON")
        el.disabled = el.dataset.moqPrevDisabled === "1";

      delete el.dataset.moqPrevOpacity;
      delete el.dataset.moqPrevPointerEvents;
      delete el.dataset.moqPrevDisabled;
    });
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
        "[moq] no se pudo ajustar el input de cantidad",
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
        enableActionButtons();
        clearMoqWarnings();
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

      const errors = [];
      for (const handle of Object.keys(productGroups)) {
        const group = productGroups[handle];
        if (group.moq !== null && group.totalQuantity < group.moq) {
          errors.push({
            titles: group.titles,
            required: group.moq,
            current: group.totalQuantity,
          });
          for (const key of group.keys) {
            trySetQuantityInputMin({ key }, group.moq);
          }
        }
      }

      const hasError = errors.length > 0;

      if (hasError) renderMoqWarnings(errors);
      else clearMoqWarnings();

      if (!config.enabled) {
        enableActionButtons();
      } else if (hasError) {
        disableActionButtons();
      } else {
        enableActionButtons();
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
    let recheckTimer = null;

    async function runValidation() {
      if (isValidating) {
        // Una validación ya está en vuelo (el drawer se acaba de abrir, etc).
        // Re-programamos en vez de descartar, o el estado queda obsoleto y los
        // botones nunca se deshabilitan.
        clearTimeout(recheckTimer);
        recheckTimer = setTimeout(runValidation, VALIDATION_DEBOUNCE_MS);
        return;
      }
      isValidating = true;
      try {
        await loadConfig();
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

    // Observe cart changes — con debounce, y descartando las mutaciones que
    // genera el propio script (pintar/borrar el banner). Sin ese filtro, cada
    // validacion se disparaba a si misma y el banner entraba en bucle.
    const observer = new MutationObserver((records) => {
      if (ignoreMutations) return;
      if (records.length && records.every(isBannerOnlyMutation)) return;
      scheduleValidation();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Listen for cart AJAX updates
    document.addEventListener("cart:change", scheduleValidation);
    document.addEventListener("cart:refresh", scheduleValidation);

    // Intercept fetch/XHR for cart updates.
    // Ojo: el segundo argumento de .then() (rechazo) es obligatorio — sin el,
    // cualquier /cart/add fallido genera un unhandled rejection en consola.
    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      const result = originalFetch.apply(this, args);
      try {
        const requestUrl =
          typeof args[0] === "string"
            ? args[0]
            : args[0] instanceof URL
              ? args[0].href
              : args[0]?.url || "";

        if (
          requestUrl.includes("/cart/add") ||
          requestUrl.includes("/cart/update") ||
          requestUrl.includes("/cart/change")
        ) {
          result.then(
            () => setTimeout(scheduleValidation, 100),
            () => {},
          );
        }
      } catch {
        /* nunca romper el fetch del theme por esto */
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
