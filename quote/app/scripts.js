document.addEventListener('contextmenu', function(event) {
    event.preventDefault();
});

/* Respaldo del logo: si brand.svg no carga (SVG embebido bloqueado,
   apertura por file:// con restricciones, CDN sin el asset…), se
   prueba brand-01.png. El SVG es la fuente principal porque, al ser
   un <img>, los navegadores lo imprimen aunque el usuario desactive
   «Gráficos de fondo». */
document.querySelectorAll('img[data-fallback-src]').forEach(function(img) {
    var useFallback = function() {
        if (img.dataset.fallbackApplied) return;
        img.dataset.fallbackApplied = '1';
        img.src = img.dataset.fallbackSrc;
    };

    if (img.complete) {
        if (img.naturalWidth === 0) useFallback();
        return;
    }

    img.addEventListener('error', useFallback);
});
