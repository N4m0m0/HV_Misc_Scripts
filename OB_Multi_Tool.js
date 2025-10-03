// ==UserScript==
// @name         OB Multi Tool — buscador robusto (config remota, shadow DOM, reintentos)
// @namespace    https://github.com/N4m0m0/HV_Misc_Scripts
// @version      1.0.2
// @description  Panel con campo + botones. Inyección robusta: shadow DOM, reintentos, escucha SPA. Config remota controlada desde repo.
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/OB_Multi_Tool.js
// @updateURL    https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/OB_Multi_Tool.js
// ==/UserScript==

(function(){
  'use strict';
  try {
    console.log('OB Multi Tool started');

    // ---------- CONFIG ----------
    const CONFIG_URL = 'https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/OB_Multi_Tool_Config.json';
    const LS_KEY = 'ob_multi_tool_remote_config_v1';
    const DEFAULT_CONFIG = { domains: ["*.booking.iberostar.com"], cacheTTLSeconds: 3600 };
    const FETCH_TIMEOUT_MS = 8000;

    // fetch con timeout
    async function fetchWithTimeout(url, timeoutMs) {
      const controller = new AbortController();
      const id = setTimeout(()=> controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        clearTimeout(id);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.text();
      } finally { clearTimeout(id); }
    }

    function saveConfigToCache(cfg) {
      try { localStorage.setItem(LS_KEY, JSON.stringify({ cfg: cfg, ts: Date.now() })); }
      catch(e){ console.warn('OB Multi Tool: cannot save config cache', e); }
    }
    function loadConfigFromCacheRaw() {
      try { const raw = localStorage.getItem(LS_KEY); if(!raw) return null; return JSON.parse(raw); }
      catch(e){ return null; }
    }

    function domainMatches(pattern, host) {
      pattern = String(pattern).trim().toLowerCase();
      host = String(host).toLowerCase();
      if(pattern === '*' || pattern === '*:*') return true;
      if(pattern.startsWith('*.')) {
        const base = pattern.slice(2);
        return host === base || host.endsWith('.' + base);
      }
      return host === pattern || host.endsWith('.' + pattern);
    }

    async function loadRemoteConfig(force=false) {
      try {
        const cachedRaw = loadConfigFromCacheRaw();
        if(!force && cachedRaw) {
          const age = (Date.now() - (cachedRaw.ts || 0)) / 1000;
          const ttl = (cachedRaw.cfg && Number(cachedRaw.cfg.cacheTTLSeconds)) || DEFAULT_CONFIG.cacheTTLSeconds;
          if(age < ttl) {
            console.log('OB Multi Tool: using cached config (age ' + Math.round(age) + 's)');
            return cachedRaw.cfg;
          }
        }
        console.log('OB Multi Tool: fetching remote config from', CONFIG_URL);
        const txt = await fetchWithTimeout(CONFIG_URL, FETCH_TIMEOUT_MS);
        const parsed = Object.assign({}, DEFAULT_CONFIG, JSON.parse(txt) || {});
        if(!Array.isArray(parsed.domains)) parsed.domains = DEFAULT_CONFIG.domains.slice();
        saveConfigToCache(parsed);
        console.log('OB Multi Tool: fetched and cached remote config', parsed);
        return parsed;
      } catch(e) {
        console.warn('OB Multi Tool: failed to load remote config, falling back to cache/default', e);
        const cachedRaw2 = loadConfigFromCacheRaw();
        if(cachedRaw2 && cachedRaw2.cfg) {
          console.log('OB Multi Tool: using cached config after error');
          return cachedRaw2.cfg;
        }
        return DEFAULT_CONFIG;
      }
    }

    // ---------- UI (shadow DOM) ----------
    // HTML & CSS para el panel — se inyectará dentro de un ShadowRoot para aislar estilos
    function buildPanelHTML() {
      const html = `
        <style>
          :host { all: initial; }
          .panel {
            position: fixed;
            left: 12px;
            top: 12px;
            z-index: 999999999;
            width: 320px;
            background: #fff;
            color: #111;
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 8px;
            box-shadow: 0 6px 24px rgba(0,0,0,0.2);
            font-family: system-ui,Segoe UI,Roboto,Arial;
            font-size: 13px;
          }
          .row { display:flex; gap:6px; align-items:center; margin-bottom:8px; }
          .input { flex:1; padding:6px; border:1px solid #ccc; border-radius:4px; font-size:13px; }
          .close { padding:6px 8px; border-radius:4px; border:none; background:#eee; cursor:pointer; }
          .btn { flex:1; padding:8px; border-radius:6px; border:none; cursor:pointer; color:#fff; }
          .rc { background:#1976D2; }
          .hc { background:#4CAF50; }
          .hint { margin-top:8px; font-size:12px; color:#666; }
        </style>
        <div class="panel" id="panel">
          <div class="row">
            <input id="ob_multi_input" class="input" placeholder="Texto a buscar..." />
            <button id="ob_multi_close" class="close" title="Cerrar">✕</button>
          </div>
          <div style="display:flex;gap:8px">
            <button id="ob_multi_rcodes" class="btn rc">R.Codes</button>
            <button id="ob_multi_hcode" class="btn hc">H.Code</button>
          </div>
          <div class="hint">Introduce texto y pulsa un botón.</div>
        </div>
      `;
      return html;
    }

    function createShadowButtonAndPanel(rootContainerId = 'ob_multi_host') {
      // if exists return
      if(document.getElementById('ob_multi_host')) return true;
      try {
        const host = document.createElement('div');
        host.id = 'ob_multi_host';
        // append to documentElement to be resilient if body replaced
        (document.documentElement || document.body || document).appendChild(host);

        const shadow = host.attachShadow({ mode: 'open' });
        // trigger button in light DOM (outside shadow) for easier click capture if needed
        const trigger = document.createElement('button');
        trigger.id = 'ob_multi_trigger';
        trigger.textContent = 'OB Tool';
        Object.assign(trigger.style, {
          position:'fixed', left:'12px', top:'12px', zIndex:999999999, padding:'8px 10px',
          background:'#1976D2', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.2)'
        });
        // insert trigger before shadow content so it remains visible
        host.appendChild(trigger);

        // panel inside shadow
        shadow.innerHTML = buildPanelHTML();
        const btnClose = shadow.getElementById('ob_multi_close');
        const input = shadow.getElementById('ob_multi_input');
        const btnR = shadow.getElementById('ob_multi_rcodes');
        const btnH = shadow.getElementById('ob_multi_hcode');

        // attach handlers
        trigger.addEventListener('click', () => {
          const panel = shadow.getElementById('panel');
          panel.style.display = panel.style.display === 'none' ? 'block' : 'block';
        });
        btnClose && btnClose.addEventListener('click', () => host.remove());
        btnR && btnR.addEventListener('click', () => {
          const txt = (input.value || '').trim();
          console.log('OB Multi Tool: R.Codes ->', txt);
          showToast('R.Codes pulsado — ' + (txt || '(vacío)'), 2500);
        });
        btnH && btnH.addEventListener('click', () => {
          const txt = (input.value || '').trim();
          console.log('OB Multi Tool: H.Code ->', txt);
          showToast('H.Code pulsado — ' + (txt || '(vacío)'), 2500);
        });
        input && input.addEventListener('keydown', (e) => { if(e.key === 'Enter') btnR.click(); });

        console.log('OB Multi Tool: shadow-based UI created');
        return true;
      } catch(e) {
        console.error('OB Multi Tool: createShadowButtonAndPanel error', e);
        return false;
      }
    }

    // toast in main document for visibility (not in shadow)
    function showToast(msg, t=2500) {
      try {
        const id = 'ob_multi_toast';
        let el = document.getElementById(id);
        if(!el){
          el = document.createElement('div');
          el.id = id;
          Object.assign(el.style, { position:'fixed', left:'12px', top:'52px', zIndex:999999999, padding:'8px 12px', background:'rgba(0,0,0,0.85)', color:'#fff', borderRadius:'6px', fontSize:'13px' });
          document.documentElement.appendChild(el);
        }
        el.textContent = msg; el.style.display = 'block';
        clearTimeout(el._t); el._t = setTimeout(()=> el.style.display='none', t);
      } catch(e){ console.warn('OB Multi Tool: toast failed', e); }
    }

    // ensure injection with retries and observers
    async function ensureInjectedWithRetries(cfg) {
      const maxRetries = 30;        // tries
      const delayMs = 1000;         // between tries
      for(let i=0;i<maxRetries;i++){
        try {
          // check allowed domain each attempt (config may change)
          const host = location.hostname;
          if(!(cfg.domains && cfg.domains.some(p => domainMatches(p, host)))) {
            console.log('OB Multi Tool: domain not allowed at ensureInjected:', host);
            return false;
          }
          // attempt create
          const ok = createShadowButtonAndPanel();
          if(ok) {
            console.log('OB Multi Tool: trigger injected (attempt', i+1, ')');
            return true;
          }
        } catch(e) {
          console.warn('OB Multi Tool: injection attempt error', e);
        }
        // wait and retry
        await new Promise(r => setTimeout(r, delayMs));
      }
      console.warn('OB Multi Tool: failed to inject after retries');
      return false;
    }

    // observe removal and re-inject
    function setupMutationWatch(cfg) {
      try {
        const docEl = document.documentElement || document;
        const mo = new MutationObserver(() => {
          if(!document.getElementById('ob_multi_host')) {
            console.log('OB Multi Tool: host removed — re-injecting');
            ensureInjectedWithRetries(cfg);
          }
        });
        mo.observe(docEl, { childList: true, subtree: true });
      } catch(e){ console.warn('OB Multi Tool: mutation observer failed', e); }
    }

    // hook history API to detect SPA navigation
    function setupHistoryHook(cfg) {
      try {
        const _push = history.pushState;
        history.pushState = function() {
          _push.apply(this, arguments);
          setTimeout(()=> ensureInjectedWithRetries(cfg), 300);
        };
        const _replace = history.replaceState;
        history.replaceState = function() {
          _replace.apply(this, arguments);
          setTimeout(()=> ensureInjectedWithRetries(cfg), 300);
        };
        window.addEventListener('popstate', () => setTimeout(()=> ensureInjectedWithRetries(cfg), 300));
      } catch(e){ console.warn('OB Multi Tool: history hook failed', e); }
    }

    function setupShortcut(cfg) {
      window.addEventListener('keydown', async (ev) => {
        if(ev.ctrlKey && ev.shiftKey && (ev.code === 'KeyR' || ev.key.toLowerCase()==='r')) {
          ev.preventDefault();
          showToast('Recargando configuración remota...', 1400);
          const cfgNew = await loadRemoteConfig(true);
          await ensureInjectedWithRetries(cfgNew);
          showToast('Recarga completada', 1200);
        }
      });
    }

    // ----- init -----
    (async function init(){
      try {
        const cfg = await loadRemoteConfig(false);
        console.log('OB Multi Tool: config used at init:', cfg);
        const injected = await ensureInjectedWithRetries(cfg);
        if(injected) {
          setupMutationWatch(cfg);
          setupHistoryHook(cfg);
          setupShortcut(cfg);
          console.log('OB Multi Tool: fully initialized');
        } else {
          console.warn('OB Multi Tool: not injected (domain may be not allowed or injection failed)');
        }
      } catch(e) {
        console.error('OB Multi Tool: init error', e);
      }
    })();

  } catch (fatal) {
    console.error('OB Multi Tool fatal error (script failed to start):', fatal);
  }
})();
