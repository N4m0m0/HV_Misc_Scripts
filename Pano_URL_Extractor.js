// ==UserScript==
// @name         Extractor visores 180/360
// @namespace    https://github.com/N4m0m0/HV_Misc_Scripts
// @version      1.2.2
// @description  Extrae enlaces 180/360 y copia al portapapeles. Solo en dominios permitidos (iberostar.com, myroom.iberostar.com, booking.iberostar.com, etc.).
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/Pano_URL_Extractor.js
// @updateURL    https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/Pano_URL_Extractor.js
// ==/UserScript==

/*  NOTA:
    - NO bloqueamos iframes: el visor real puede estar dentro de myroom.iberostar.com
    - Evitamos botones duplicados por frame con un ID único.
*/

// --- Dominios permitidos (usa base; vale con subdominios) ---
const ALLOWED_DOMAINS = [
  "iberostar.com",
  "myroom.iberostar.com",
  "booking.iberostar.com",
  "myr-apiimg.iberostar.com"
];

(function () {
  const host = location.hostname.toLowerCase();
  const allowed = ALLOWED_DOMAINS.some(d => host === d || host.endsWith("." + d));
  if (!allowed) return;

  // Anti-doble inyección (por recargas/SPA/iframes)
  if (document.getElementById('tm-360-btn')) return;

  // Patrón flexible: permite http/https, admite query/hash y .html opcional al final
  const PAT = /https?:\/\/myr-apiimg\.iberostar\.com\/media\/(?:180|360)\/[^\s'"<>]+?(?:\.html\b|[\?#][^\s'"<>]*|$)/ig;

  // --- Utils ---
  async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch {}
    }
    try {
      const ta = document.createElement('textarea');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch { return false; }
  }

  function showToast(msg, timeout = 3000) {
    const id = 'tm-360-toast';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      Object.assign(el.style, {
        position: 'fixed',
        left: '12px',
        top: '60px',
        zIndex: 999999,
        padding: '8px 12px',
        background: 'rgba(0,0,0,0.8)',
        color: '#fff',
        borderRadius: '6px',
        fontSize: '13px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
      });
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, timeout);
  }

  // helper para evitar problemas con lastIndex de regex global
  function addMatchesFromString(reGlobal, str, bucket) {
    if (!str) return;
    const re = new RegExp(reGlobal.source, reGlobal.flags); // clonar
    let m;
    while ((m = re.exec(str)) !== null) {
      bucket.add(m[0]);
      if (m.index === re.lastIndex) re.lastIndex++; // defensivo
    }
  }

  async function scanAndCopy() {
    const found = new Set();

    // 1) Escanear atributos típicos (incluye iframes)
    document.querySelectorAll('iframe, a, link, script').forEach(el => {
      ['src', 'href', 'data-src', 'data-url'].forEach(attr => {
        let v = el.getAttribute?.(attr);
        if (v) {
          try { v = (new URL(v, location.href)).href; } catch {}
          addMatchesFromString(PAT, v, found);
        }
      });
      if (el.tagName === 'SCRIPT' && el.textContent) {
        addMatchesFromString(PAT, el.textContent, found);
      }
    });

    // 2) Escanear HTML completo (por si hay inline)
    addMatchesFromString(PAT, document.documentElement.innerHTML, found);

    if (found.size === 0) {
      showToast('No se encontraron enlaces myr-apiimg en esta página.', 3500);
      return;
    }

    const list = Array.from(found).sort();
    const ok = await copyToClipboard(list.join('\n'));
    showToast(ok ? `Copiados ${list.length} enlaces al portapapeles ✅`
                 : 'Error: no se pudo copiar al portapapeles. Revisa permisos.',
              ok ? 3500 : 5000);
    console.log('myr360 links:', list);
  }

  // --- Botón (uno por frame) ---
  const btn = document.createElement('button');
  btn.id = 'tm-360-btn';
  btn.textContent = 'Copiar 180/360';
  Object.assign(btn.style, {
    position: 'fixed',
    left: '22px',
    top: '82px',
    zIndex: 999999,
    padding: '8px 12px',
    background: '#1976D2',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
  });
  btn.addEventListener('click', scanAndCopy);
  document.body.appendChild(btn);
})();
