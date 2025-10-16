// ==UserScript==
// @name         Extractor visores 180/360 — botón único
// @namespace    https://github.com/N4m0m0/HV_Misc_Scripts
// @version      1.2.4
// @description  Copia URLs de visores 180/360 (.html) de Iberostar. Un botón (en top) agrega resultados de todos los iframes.
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/Pano_URL_Extractor.js
// @updateURL    https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/Pano_URL_Extractor.js
// ==/UserScript==

/* Dominios permitidos (subdominios incluidos) */
const ALLOWED_DOMAINS = [
  "iberostar.com",
  "myroom.iberostar.com",
  "booking.iberostar.com"
];

(function () {
  const host = location.hostname.toLowerCase();
  const allowed = ALLOWED_DOMAINS.some(d => host === d || host.endsWith("." + d));
  if (!allowed) return;

  // Solo URLs de visor .html (permite ?query o #hash)
  const HTML_ONLY_PAT = /https?:\/\/myr-apiimg\.iberostar\.com\/media\/(?:180|360)\/[^\s'"<>]+?\.html(?:[?#][^\s'"<>]*)?$/i;

  // -------- helpers comunes --------
  function showToast(msg, timeout = 3000) {
    const id = 'tm-360-toast';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      Object.assign(el.style, {
        position:'fixed', left:'12px', top:'60px', zIndex: 999999,
        padding:'8px 12px', background:'rgba(0,0,0,0.85)', color:'#fff',
        borderRadius:'6px', fontSize:'13px', boxShadow:'0 2px 6px rgba(0,0,0,0.3)'
      });
      document.body.appendChild(el);
    }
    el.textContent = msg; el.style.display = 'block';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(()=>{ el.style.display = 'none'; }, timeout);
  }

  async function copyToClipboard(text) {
    try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch {}
    try {
      const ta = document.createElement('textarea');
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy');
      ta.remove(); return true;
    } catch { return false; }
  }

  // Escáner local (solo <iframe> y <a>, y solo src/href -> visor .html)
  function scanHereForHtmlViewers() {
    const set = new Set();
    const nodes = document.querySelectorAll('iframe, a');
    nodes.forEach(el => {
      ['src', 'href', 'data-src', 'data-url'].forEach(attr => {
        let v = el.getAttribute?.(attr);
        if (!v) return;
        try { v = (new URL(v, location.href)).href; } catch {}
        if (HTML_ONLY_PAT.test(v)) set.add(v);
      });
    });
    return Array.from(set).sort();
  }

  // Listener para peticiones del top
  window.addEventListener('message', (ev) => {
    const data = ev.data;
    if (!data || data.type !== 'HV_SCAN') return;
    try {
      const list = scanHereForHtmlViewers();
      window.top.postMessage({ type: 'HV_RESULT', origin: location.hostname, list }, '*');
    } catch {}
  });

  // -------- Solo en el frame superior: botón único y agregación --------
  if (window.top === window) {
    if (document.getElementById('tm-360-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'tm-360-btn';
    btn.textContent = 'Copiar 180/360';
    Object.assign(btn.style, {
      position:'fixed', left:'22px', top:'82px', zIndex:999999,
      padding:'8px 12px', background:'#1976D2', color:'#fff',
      border:'none', borderRadius:'6px', cursor:'pointer',
      boxShadow:'0 2px 6px rgba(0,0,0,0.2)'
    });

    btn.addEventListener('click', async () => {
      const aggregate = new Set();

      // 1) Escanea el propio top
      scanHereForHtmlViewers().forEach(u => aggregate.add(u));

      // 2) Pide a todos los iframes (y sub-iframes) que escaneen
      function broadcast(win) {
        try { win.postMessage({ type:'HV_SCAN' }, '*'); } catch {}
        for (let i = 0; i < win.frames.length; i++) {
          try { broadcast(win.frames[i]); } catch {}
        }
      }
      broadcast(window);

      // 3) Recoge respuestas durante una pequeña ventana
      const handler = (ev) => {
        const data = ev.data;
        if (!data || data.type !== 'HV_RESULT') return;
        (data.list || []).forEach(u => aggregate.add(u));
      };
      window.addEventListener('message', handler);
      await new Promise(r => setTimeout(r, 600)); // sube a 1000ms si ves SPA muy perezosas
      window.removeEventListener('message', handler);

      const list = Array.from(aggregate);
      if (list.length === 0) {
        showToast('No se encontraron enlaces myr-apiimg (.html) en esta página.', 3500);
        return;
      }

      const ok = await copyToClipboard(list.join('\n'));
      showToast(ok ? `Copiados ${list.length} enlaces al portapapeles ✅`
                   : 'Error: no se pudo copiar al portapapeles.', ok ? 3500 : 5000);
      console.log('myr360 html links:', list);
    });

    document.body.appendChild(btn);
  }
})();
