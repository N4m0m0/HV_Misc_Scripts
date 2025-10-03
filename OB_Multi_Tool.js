// ==UserScript==
// @name         OB Multi Tool
// @namespace    https://github.com/N4m0m0/HV_Misc_Scripts
// @version      0.0.1
// @description  <Multy-Herramienta para Onboarding>.
// @author       N4m0m0
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @connect      raw.githubusercontent.com
// @downloadURL  https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/41b133a7c7dfd599768cf8598d02f864476893b4/OB_Multi_Tool.js
// @updateURL    https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/41b133a7c7dfd599768cf8598d02f864476893b4/OB_Multi_Tool.js
// ==/UserScript==

(function() {
  'use strict';

  // --- URL de configuración remota (RAW del JSON del commit indicado) ---
  const CONFIG_URL = 'https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/41b133a7c7dfd599768cf8598d02f864476893b4/OB_Multi_Tool_Config.json';

  // --- Defaults por si el JSON no responde o no define campos ---
  const DEFAULT_CONFIG = {
    allowed_domains: [],              // vacío = permitido en todos
    engines: ['Google', 'Bing', 'DuckDuckGo'],
    ui: { position: 'top-right' }     // reservado para futuros ajustes
  };

  // ====== Utilidad: fetch JSON con GM.xmlHttpRequest ======
  function fetchJSON(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 10000,
        onload: (res) => {
          try {
            const data = JSON.parse(res.responseText);
            resolve(data);
          } catch (e) {
            console.warn('[OB-MT] JSON inválido, usando defaults.', e);
            resolve(null);
          }
        },
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    });
  }

  // ====== Estilos del panel ======
  GM_addStyle(`
    .obmt-panel {
      position: fixed; top: 16px; right: 16px; z-index: 999999;
      background: #111827; color: #e5e7eb; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      border: 1px solid #374151; border-radius: 12px; padding: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,.35); min-width: 300px;
    }
    .obmt-title { font-size: 14px; font-weight: 700; margin: 0 0 8px; }
    .obmt-row { display: flex; gap: 8px; align-items: center; margin: 8px 0; }
    .obmt-select, .obmt-input, .obmt-btn {
      height: 34px; border-radius: 10px; border: 1px solid #374151;
      background: #1f2937; color: #e5e7eb; padding: 0 10px; font-size: 13px;
    }
    .obmt-select { min-width: 140px; }
    .obmt-input { flex: 1; }
    .obmt-btn { cursor: pointer; }
    .obmt-btn[disabled] { opacity: .5; cursor: not-allowed; }
    .obmt-meta { font-size: 11px; color: #9ca3af; margin-top: 4px; }
  `);

  // ====== Construcción del panel (sin acciones todavía) ======
  function buildPanel(cfg) {
    const panel = document.createElement('div');
    panel.className = 'obmt-panel';
    panel.innerHTML = `
      <div class="obmt-title">OB Multi Tool</div>

      <div class="obmt-row">
        <select class="obmt-select" id="obmt-engine"></select>
        <input class="obmt-input" id="obmt-text" type="text" placeholder="Escribe aquí…" />
      </div>

      <div class="obmt-row">
        <button class="obmt-btn" id="obmt-btn-rt" title="Acción R.T.">R.T.</button>
        <button class="obmt-btn" id="obmt-btn-code" title="Acción Code (próx.)" disabled>Code</button>
      </div>

      <div class="obmt-meta">
        Dom: <strong>${location.host}</strong>
      </div>
    `;

    // Poblamos engines desde config o defaults
    const ddl = panel.querySelector('#obmt-engine');
    const engines = Array.isArray(cfg.engines) && cfg.engines.length ? cfg.engines : DEFAULT_CONFIG.engines;
    engines.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      ddl.appendChild(opt);
    });

    // Persistimos última selección
    const last = GM_getValue('obmt_engine', engines[0]);
    if (engines.includes(last)) ddl.value = last;
    ddl.addEventListener('change', () => GM_setValue('obmt_engine', ddl.value));

    // Botones (sin lógica; solo placeholders visuales)
    panel.querySelector('#obmt-btn-rt').addEventListener('click', () => {
      // Aquí después añadiremos la acción real de R.T.
      console.log('[OB-MT] R.T. pulsado — (sin acción todavía)');
    });
    panel.querySelector('#obmt-btn-code').addEventListener('click', () => {
      // Reservado para la acción "Code"
      console.log('[OB-MT] Code pulsado — (desactivado)');
    });

    document.body.appendChild(panel);
  }

  // ====== Main ======
  (async function init() {
    const remote = await fetchJSON(CONFIG_URL);
    const cfg = Object.assign({}, DEFAULT_CONFIG, remote || {});
    const allow = Array.isArray(cfg.allowed_domains) ? cfg.allowed_domains : [];

    // Allowlist: si la lista está vacía => permitido en todos; si no, solo si incluye el host actual.
    if (allow.length > 0 && !allow.includes(location.host)) {
      console.log('[OB-MT] Dominio no permitido por configuración. Panel oculto.');
      return;
    }
    buildPanel(cfg);
  })();

})();
