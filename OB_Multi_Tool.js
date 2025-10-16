// ==UserScript==
// @name         OB Multi Tool
// @namespace    https://github.com/N4m0m0/HV_Misc_Scripts
// @version      1.2.0
// @description  Panel con campo + botones.
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/OB_Multi_Tool.js
// @updateURL    https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/OB_Multi_Tool.js
// ==/UserScript==

(function () {
  'use strict';
  try {
    console.log('OB Multi Tool started');

    // ---------- CONFIG ----------
    // Controla en qué dominios se inyecta la UI
    const DEFAULT_CONFIG = {
      domains: [
        'reservation.barcelo.com'   // exacto; puedes usar "*.barcelo.com" también
      ]
    };

    // ---------- UTILIDADES ----------
    function domainMatches(pattern, host) {
      pattern = String(pattern).trim().toLowerCase();
      host = String(host).toLowerCase();
      if (pattern === '*' || pattern === '*:*') return true;
      if (pattern.startsWith('*.')) {
        const base = pattern.slice(2);
        return host === base || host.endsWith('.' + base);
      }
      return host === pattern || host.endsWith('.' + pattern);
    }

    // Extrae pares {code, name_category} a partir de un atributo (p.ej. "data-target-room-code")
    function extractRoomCodes(attrName) {
      attrName = (attrName || '').trim();
      if (!attrName) return [];

      let nodes;
      try {
        nodes = document.querySelectorAll(`[${attrName}]`);
      } catch {
        nodes = Array.from(document.querySelectorAll('*')).filter(el => el.hasAttribute(attrName));
      }

      const rows = [];
      for (const el of nodes) {
        const code = (el.getAttribute(attrName) || '').trim();
        if (!code) continue;

        // Determinar nombre visible
        let name = (el.getAttribute('aria-label') || '').trim();
        if (name) name = name.replace(/\s*room details\s*$/i, '').trim();

        if (!name) {
          const t = el.querySelector('h1,h2,h3,[class*=Title],[class*=title],[class*=Name],[class*=name]');
          if (t) name = (t.textContent || '').trim();
        }

        if (!name) {
          const firstLine = (el.textContent || '')
            .trim()
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean)[0];
          name = firstLine || code;
        }

        rows.push({ code, name_category: name });
      }

      // Deduplicar por código
      const seen = new Set();
      return rows.filter(r => (seen.has(r.code) ? false : (seen.add(r.code), true)));
    }

    // Pinta resultados (JSON pretty) en el panel (shadow)
    function renderResultsInPanel(shadow, items) {
      const out = shadow.getElementById('ob_multi_out');
      if (!out) return;
      out.textContent = JSON.stringify(items, null, 2);
    }

    // Descarga JSON con nombre <base>_Room_Codes.json
    function downloadJSONFile(items, baseName) {
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      const safe = (baseName || 'NO_CODE').replace(/[^\w\-]+/g, '_');
      const fname = `${safe}_Room_Codes.json`;
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      document.documentElement.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }

    // Obtiene hotel_code desde __NEXT_DATA__ / URL (?hotel=) / scripts
    function getHotelCode() {
      const candidates = Array.from(document.querySelectorAll('script[type="application/json"]'))
        .filter(s => {
          const id = (s.id || '').toUpperCase();
          return id.includes('NEXT_DATA') || id.includes('NEXI_DATA') || id.includes('NEXT') || id.includes('NEXI');
        });

      for (const s of candidates) {
        try {
          const txt = s.textContent || s.innerText || '';
          if (!txt) continue;
          const data = JSON.parse(txt);

          const fromQuery = data?.query?.hotel ?? data?.props?.pageProps?.hotel ?? data?.props?.hotel;
          if (fromQuery != null) return String(fromQuery);

          const stack = [data];
          while (stack.length) {
            const cur = stack.pop();
            if (cur && typeof cur === 'object') {
              if (Object.prototype.hasOwnProperty.call(cur, 'hotel')) {
                const val = cur['hotel'];
                if (val != null && (typeof val === 'string' || typeof val === 'number')) {
                  return String(val);
                }
              }
              for (const k in cur) if (cur[k] && typeof cur[k] === 'object') stack.push(cur[k]);
            }
          }
        } catch { /* seguir buscando */ }
      }

      try {
        const u = new URL(location.href);
        const q = u.searchParams.get('hotel');
        if (q) return q;
      } catch {}

      for (const s of Array.from(document.scripts)) {
        const txt = s.textContent || '';
        const m = txt.match(/"hotel"\s*:\s*"?(?<id>\d+)"?/);
        if (m && m.groups && m.groups.id) return m.groups.id;
      }

      return null;
    }

    // ---------- CHAIN CODE MANUAL (agrupado por código) ----------
    // Soporta comodines tipo "*.dominio.com".
    const CHAIN_CODES_MANUALES = {
      "24876": [
        "reservation.barcelo.com",
        // "*.barcelo.com"  // ejemplo wildcard
      ]
      // "55555": ["reservation.ejemplo.com", "*.ejemplo.com"]
    };

    function patternMatchesDomain(pattern, host) {
      pattern = String(pattern).toLowerCase().trim();
      host = String(host).toLowerCase();
      if (pattern === '*' || pattern === '*:*') return true;
      if (pattern.startsWith('*.')) {
        const base = pattern.slice(2);
        return host === base || host.endsWith('.' + base);
      }
      return host === pattern || host.endsWith('.' + pattern);
    }

    // Devuelve el chain_code según dominio actual, o "n/d" si no hay coincidencia
    function getChainCode() {
      const host = location.hostname.toLowerCase();
      for (const [chainCode, domains] of Object.entries(CHAIN_CODES_MANUALES)) {
        for (const domain of domains) {
          if (patternMatchesDomain(domain, host)) {
            return chainCode;
          }
        }
      }
      // Aquí, en el futuro, se implementará scraping / lógica dinámica
      return "n/d";
    }

    // ---------- UI (shadow DOM) ----------
    function buildPanelHTML() {
      const html = `
<style>
:host { all: initial; }
.panel {
  position: fixed; left: 12px; top: 24px; z-index: 999999999; width: 360px;
  background: #fff; color: #111; border: 1px solid #ddd; border-radius: 8px; padding: 8px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.2); font-family: system-ui,Segoe UI,Roboto,Arial; font-size: 13px;
}
.row { display:flex; gap:6px; align-items:center; margin-bottom:8px; }
.input { flex:1; padding:6px; border:1px solid #ccc; border-radius:4px; font-size:13px; }
.small { width: 150px; }
.close { padding:6px 8px; border-radius:4px; border:none; background:#eee; cursor:pointer; }
.btn { flex:1; padding:8px; border-radius:6px; border:none; cursor:pointer; color:#fff; }
.rc { background:#1976D2; }
.hint { margin-top:8px; font-size:12px; color:#666; }
.out {
  margin-top:8px; max-height: 260px; overflow:auto;
  font-family: ui-monospace, Menlo, Consolas, monospace; font-size:12px;
  background:#fafafa; border:1px solid #eee; border-radius:6px; padding:8px; white-space:pre;
}
</style>
<div class="panel" id="panel">
  <div class="row">
    <input id="ob_multi_input" class="input" placeholder="Texto a buscar (p.ej. data-target-room-code)" />
    <button id="ob_multi_close" class="close" title="Cerrar">✕</button>
  </div>
  <div class="row">
    <button id="ob_multi_rcodes" class="btn rc">Search-Codes</button>
    <input id="ob_hotel_code_input" class="input small" placeholder="Codigo del Hotel" title="Se usará para el nombre del archivo" />
  </div>
  <div class="hint">
    Escribe el texto a buscar y pulsa Search-Codes. Si lo dejas vacío, usa "data-target-room-code".
    El archivo se nombrará con lo que escribas en "Codigo del Hotel".
  </div>
  <div id="ob_multi_out" class="out"></div>
</div>`;
      return html;
    }

    function createShadowButtonAndPanel(rootContainerId = 'ob_multi_host') {
      if (document.getElementById('ob_multi_host')) return true;
      try {
        const host = document.createElement('div');
        host.id = 'ob_multi_host';
        (document.documentElement || document.body || document).appendChild(host);

        const shadow = host.attachShadow({ mode: 'open' });

        const trigger = document.createElement('button');
        trigger.id = 'ob_multi_trigger';
        trigger.textContent = 'OB Tool';
        Object.assign(trigger.style, {
          position: 'fixed', left: '12px', top: '65px', zIndex: 999999999, padding: '8px 10px',
          background: '#1976D2', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        });
        host.appendChild(trigger);

        shadow.innerHTML = buildPanelHTML();
        const btnClose = shadow.getElementById('ob_multi_close');
        const inputAttr = shadow.getElementById('ob_multi_input');
        const btnSearch = shadow.getElementById('ob_multi_rcodes');
        const inputHotelFile = shadow.getElementById('ob_hotel_code_input');

        trigger.addEventListener('click', () => {
          const panel = shadow.getElementById('panel');
          panel.style.display = panel.style.display === 'none' ? 'block' : 'block';
        });

        btnClose && btnClose.addEventListener('click', () => host.remove());

        // SEARCH-CODES: buscar, componer cabecera y (si hay) descargar JSON
        btnSearch && btnSearch.addEventListener('click', () => {
          const attr = (inputAttr.value || '').trim() || 'data-target-room-code';
          const items = extractRoomCodes(attr);

          // Cabecera: hotel_code (o "n/d") y chain_code (manual por dominio o "n/d")
          const pageHotelCode = getHotelCode() || "n/d";
          const chainCode = getChainCode() || "n/d";

          const header = {
            external_code_CMS: `${pageHotelCode}|${chainCode}`,
            hotel_code: pageHotelCode,
            chain_code: chainCode
          };

          const finalArray = [header, ...items];
          renderResultsInPanel(shadow, finalArray);

          if (items.length > 0) {
            const fileBase = (inputHotelFile.value || '').trim() || 'NO_CODE';
            downloadJSONFile(finalArray, fileBase);
            showToast(`Encontrados ${items.length} resultados para "${attr}" (descargado)`, 3000);
          } else {
            showToast(`Sin coincidencias para "${attr}". No se descargó archivo.`, 3000);
          }

          console.log('OB Multi Tool: Search-Codes ->', { attr, hotel_code: pageHotelCode, chain_code: chainCode, total: items.length });
        });

        inputAttr && inputAttr.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnSearch.click(); });

        console.log('OB Multi Tool: shadow-based UI created');
        return true;
      } catch (e) {
        console.error('OB Multi Tool: createShadowButtonAndPanel error', e);
        return false;
      }
    }

    // Toast fuera del shadow
    function showToast(msg, t = 2500) {
      try {
        const id = 'ob_multi_toast';
        let el = document.getElementById(id);
        if (!el) {
          el = document.createElement('div');
          el.id = id;
          Object.assign(el.style, {
            position: 'fixed', left: '12px', top: '52px', zIndex: 999999999, padding: '8px 12px',
            background: 'rgba(0,0,0,0.85)', color: '#fff', borderRadius: '6px', fontSize: '13px'
          });
          document.documentElement.appendChild(el);
        }
        el.textContent = msg; el.style.display = 'block';
        clearTimeout(el._t); el._t = setTimeout(() => el.style.display = 'none', t);
      } catch (e) { console.warn('OB Multi Tool: toast failed', e); }
    }

    // ---------- Inyección con reintentos ----------
    async function ensureInjectedWithRetries(cfg) {
      const maxRetries = 30;
      const delayMs = 1000;
      for (let i = 0; i < maxRetries; i++) {
        try {
          const host = location.hostname;
          if (!(cfg.domains && cfg.domains.some(p => domainMatches(p, host)))) {
            console.log('OB Multi Tool: domain not allowed at ensureInjected:', host);
            return false;
          }
          const ok = createShadowButtonAndPanel();
          if (ok) {
            console.log('OB Multi Tool: trigger injected (attempt', i + 1, ')');
            return true;
          }
        } catch (e) {
          console.warn('OB Multi Tool: injection attempt error', e);
        }
        await new Promise(r => setTimeout(r, delayMs));
      }
      console.warn('OB Multi Tool: failed to inject after retries');
      return false;
    }

    function setupMutationWatch(cfg) {
      try {
        const docEl = document.documentElement || document;
        const mo = new MutationObserver(() => {
          if (!document.getElementById('ob_multi_host')) {
            console.log('OB Multi Tool: host removed — re-injecting');
            ensureInjectedWithRetries(cfg);
          }
        });
        mo.observe(docEl, { childList: true, subtree: true });
      } catch (e) { console.warn('OB Multi Tool: mutation observer failed', e); }
    }

    function setupHistoryHook(cfg) {
      try {
        const _push = history.pushState;
        history.pushState = function () { _push.apply(this, arguments); setTimeout(() => ensureInjectedWithRetries(cfg), 300); };
        const _replace = history.replaceState;
        history.replaceState = function () { _replace.apply(this, arguments); setTimeout(() => ensureInjectedWithRetries(cfg), 300); };
        window.addEventListener('popstate', () => setTimeout(() => ensureInjectedWithRetries(cfg), 300));
      } catch (e) { console.warn('OB Multi Tool: history hook failed', e); }
    }

    function setupShortcut(cfg) {
      window.addEventListener('keydown', async (ev) => {
        if (ev.ctrlKey && ev.shiftKey && (ev.code === 'KeyR' || ev.key.toLowerCase() === 'r')) {
          ev.preventDefault();
          showToast('Reinyectando con configuración local...', 1400);
          await ensureInjectedWithRetries(cfg);
          showToast('Hecho', 1200);
        }
      });
    }

    // ----- init -----
    (async function init() {
      try {
        const cfg = DEFAULT_CONFIG;
        console.log('OB Multi Tool: config used at init (local):', cfg);
        const injected = await ensureInjectedWithRetries(cfg);
        if (injected) {
          setupMutationWatch(cfg);
          setupHistoryHook(cfg);
          setupShortcut(cfg);
          console.log('OB Multi Tool: fully initialized (local config)');
        } else {
          console.warn('OB Multi Tool: not injected (domain may be not allowed or injection failed)');
        }
      } catch (e) {
        console.error('OB Multi Tool: init error', e);
      }
    })();

  } catch (fatal) {
    console.error('OB Multi Tool fatal error (script failed to start):', fatal);
  }
})();
