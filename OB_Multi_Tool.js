// ==UserScript==
// @name         OB Multi Tool
// @namespace    https://github.com/N4m0m0/HV_Misc_Scripts
// @version      0.0.6
// @description  Panel base (DDL + input + R.T./Code). Panel siempre visible; acciones bloqueadas por allowlist con aviso.
// @author       N4m0m0
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @connect      raw.githubusercontent.com
// @downloadURL  https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/OB_Multi_Tool.js
// @updateURL    https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/OB_Multi_Tool.js
// ==/UserScript==

(function() {
  'use strict';

  // --- REMOTE CONFIG ---
  const CONFIG_URL = 'https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/OB_Multi_Tool_Config.json';

  const DEFAULT_CONFIG = {
    allowed_domains: [],           // vacío => permitido en todos
    engines: ['Synxis'],
    ui: { position: 'top-right' }  // 'top-right' | 'top-left'
  };

  // --- FETCH JSON VIA GM_xhr ---
  function fetchJSON(url) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: 10000,
        onload: (res) => {
          try { resolve(JSON.parse(res.responseText)); }
          catch (e) { console.warn('[OB-MT] JSON inválido, usando defaults.', e); resolve(null); }
        },
        onerror: (e) => { console.warn('[OB-MT] onerror', e); resolve(null); },
        ontimeout: () => { console.warn('[OB-MT] timeout'); resolve(null); },
      });
    });
  }

  // --- GLOB/ALLOWLIST ---
  function globToRegExp(glob) {
    const esc = String(glob).replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const rx = '^' + esc.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    return new RegExp(rx, 'i');
  }
  function isAllowed(host, patterns) {
    const list = Array.isArray(patterns) ? patterns : [];
    if (list.length === 0) return true;
    return list.some(p => globToRegExp(p).test(host));
  }

  // --- UI / STYLES ---
  GM_addStyle(`
    .obmt-panel {
      position: fixed; top: 16px; right: 16px; z-index: 2147483647 !important;
      background: #111827; color: #e5e7eb; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      border: 1px solid #374151; border-radius: 12px; padding: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.35);
      min-width: 300px;
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
    .obmt-toast {
      position: fixed; left: 16px; bottom: 16px; z-index: 2147483647 !important;
      padding: 10px 12px; border-radius: 10px; background: rgba(0,0,0,.85); color: #fff; font-size: 13px;
      box-shadow: 0 6px 24px rgba(0,0,0,.3);
    }
  `);

  function showToast(msg, ms=2200) {
    const id = 'obmt_toast';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'obmt-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = 'none'; }, ms);
  }

  function positionPanel(panel, pos) {
    panel.style.top = '16px';
    panel.style.bottom = '';
    if (pos === 'top-left') {
      panel.style.left = '16px';
      panel.style.right = '';
    } else {
      panel.style.right = '16px';
      panel.style.left = '';
    }
  }

  // --- BUILD PANEL ---
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
        <button class="obmt-btn" id="obmt-btn-rt"   title="Acción R.T.">R.T.</button>
        <button class="obmt-btn" id="obmt-btn-code" title="Acción Code">Code</button>
      </div>
      <div class="obmt-meta">Dom: <strong>${location.hostname}</strong></div>
    `;
    document.body.appendChild(panel);
    positionPanel(panel, cfg?.ui?.position || 'top-right');

    // Poblamos engines
    const ddl = panel.querySelector('#obmt-engine');
    const engines = (Array.isArray(cfg.engines) && cfg.engines.length) ? cfg.engines : DEFAULT_CONFIG.engines;
    engines.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      ddl.appendChild(opt);
    });

    // Persistencia selección
    const last = GM_getValue('obmt_engine', engines[0]);
    if (engines.includes(last)) ddl.value = last;
    ddl.addEventListener('change', () => GM_setValue('obmt_engine', ddl.value));

    // Helpers
    const getCurrentEngine = () => ddl.value;
    const getInputText = () => panel.querySelector('#obmt-text').value.trim();
    const hostAllowed = () => isAllowed(location.hostname, cfg.allowed_domains);

    // Acciones (bloqueo por dominio)
    panel.querySelector('#obmt-btn-rt').addEventListener('click', () => {
      if (!hostAllowed()) {
        showToast('Dominio no permitido por configuración.');  // ← mensaje si NO está permitido
        console.log('[OB-MT] Bloqueado por allowlist', { host: location.hostname, allow: cfg.allowed_domains });
        return;
      }
      // TODO: acción real R.T.
      showToast('R.T. — pendiente implementar (dominio permitido).');
      console.log('[OB-MT] R.T. OK', { engine: getCurrentEngine(), text: getInputText() });
    });

    panel.querySelector('#obmt-btn-code').addEventListener('click', () => {
      if (!hostAllowed()) {
        showToast('Dominio no permitido por configuración.');
        console.log('[OB-MT] Bloqueado por allowlist (Code)', { host: location.hostname, allow: cfg.allowed_domains });
        return;
      }
      // TODO: acción real Code
      showToast('Code — pendiente implementar (dominio permitido).');
      console.log('[OB-MT] Code OK', { engine: getCurrentEngine(), text: getInputText() });
    });
  }

  // --- INIT ---
  (async function init() {
    const remote = await fetchJSON(CONFIG_URL);
    const cfg = Object.assign({}, DEFAULT_CONFIG, remote || {});
    console.log('[OB-MT] init', { hostname: location.hostname, cfg });

    // Panel SIEMPRE visible:
    buildPanel(cfg);
  })();

})();
