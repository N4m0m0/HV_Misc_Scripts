// ==UserScript==
// @name         OB Multi Tool — buscador simple (config remota) - diagnostic
// @namespace    https://github.com/N4m0m0/HV_Misc_Scripts
// @version      1.0.1
// @description  Herramienta multi (config remota) — panel con campo de búsqueda + botones R.Codes / H.Code. Añade logs para diagnóstico.
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

    // --- CONFIG ---
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

    // UI / toast
    function showToast(msg, t=2800) {
      try {
        const id='ob_multi_toast';
        let el = document.getElementById(id);
        if(!el) {
          el = document.createElement('div');
          el.id = id;
          Object.assign(el.style, { position:'fixed', left:'12px', top:'52px', zIndex:99999999, padding:'8px 12px', background:'rgba(0,0,0,0.85)', color:'#fff', borderRadius:'6px', fontSize:'13px', boxShadow:'0 2px 8px rgba(0,0,0,0.3)' });
          document.body.appendChild(el);
        }
        el.textContent = msg; el.style.display='block';
        clearTimeout(el._t); el._t = setTimeout(()=> el.style.display='none', t);
      } catch(e) { console.warn('OB Multi Tool: showToast failed', e); }
    }

    // panel creation identical a lo anterior (sin cambios funcionales)
    function createPanel() {
      if(document.getElementById('ob_multi_panel')) return;
      const panel = document.createElement('div');
      panel.id = 'ob_multi_panel';
      Object.assign(panel.style, {
        position:'fixed', left:'12px', top:'12px', zIndex:99999999, width:'320px',
        background:'#fff', color:'#111', border:'1px solid #ddd', borderRadius:'8px', padding:'8px',
        boxShadow:'0 6px 24px rgba(0,0,0,0.2)', fontFamily:'system-ui,Segoe UI,Roboto,Arial', fontSize:'13px'
      });

      panel.innerHTML = `
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
          <input id="ob_multi_input" placeholder="Texto a buscar..." style="flex:1;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:13px" />
          <button id="ob_multi_close" title="Cerrar" style="padding:6px 8px;border-radius:4px;border:none;background:#eee;cursor:pointer">✕</button>
        </div>
        <div style="display:flex;gap:8px">
          <button id="ob_multi_rcodes" style="flex:1;padding:8px;border-radius:6px;border:none;background:#1976D2;color:#fff;cursor:pointer">R.Codes</button>
          <button id="ob_multi_hcode"  style="flex:1;padding:8px;border-radius:6px;border:none;background:#4CAF50;color:#fff;cursor:pointer">H.Code</button>
        </div>
        <div id="ob_multi_hint" style="margin-top:8px;font-size:12px;color:#666">Introduce texto y pulsa un botón.</div>
      `;
      document.body.appendChild(panel);

      document.getElementById('ob_multi_close').addEventListener('click', ()=> panel.remove());
      document.getElementById('ob_multi_rcodes').addEventListener('click', ()=>{
        const txt = (document.getElementById('ob_multi_input').value || '').trim();
        showToast(`R.Codes pulsado — búsqueda: "${txt}"`, 2200);
        console.log('OB Multi Tool: R.Codes ->', txt);
      });
      document.getElementById('ob_multi_hcode').addEventListener('click', ()=>{
        const txt = (document.getElementById('ob_multi_input').value || '').trim();
        showToast(`H.Code pulsado — búsqueda: "${txt}"`, 2200);
        console.log('OB Multi Tool: H.Code ->', txt);
      });
    }

    function createTriggerIfAllowed(cfg) {
      try {
        const existing = document.getElementById('ob_multi_trigger');
        if(existing) existing.remove();
        const host = location.hostname;
        const allowed = cfg && cfg.domains && cfg.domains.some(p => domainMatches(p, host));
        console.log('OB Multi Tool: domain check for', host, '=>', allowed);
        if(!allowed) {
          console.log('OB Multi Tool: domain not allowed, no trigger injected');
          return false;
        }
        const btn = document.createElement('button');
        btn.id = 'ob_multi_trigger';
        btn.title = 'OB Multi Tool — abrir panel (click). Ctrl+Shift+R: forzar recarga config';
        btn.textContent = 'OB Tool';
        Object.assign(btn.style, { position:'fixed', left:'12px', top:'12px', zIndex:99999998, padding:'8px 10px', background:'#1976D2', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.2)' });

        btn.addEventListener('click', ()=> { createPanel(); });
        btn.addEventListener('contextmenu', async (ev) => {
          ev.preventDefault();
          showToast('Forzando recarga de configuración...', 1500);
          const cfgNew = await loadRemoteConfig(true);
          if(cfgNew.domains && cfgNew.domains.some(p => domainMatches(p, location.hostname))) {
            createTriggerIfAllowed(cfgNew);
            showToast('Configuración recargada. Dominio permitido.', 2000);
          } else {
            showToast('Configuración recargada. Dominio sigue sin estar permitido.', 2000);
            const ex = document.getElementById('ob_multi_trigger'); if(ex) ex.remove();
          }
        });

        document.body.appendChild(btn);
        console.log('OB Multi Tool: trigger injected');
        return true;
      } catch(e) {
        console.error('OB Multi Tool: createTriggerIfAllowed error', e);
        return false;
      }
    }

    function setupShortcut() {
      window.addEventListener('keydown', async (ev) => {
        if(ev.ctrlKey && ev.shiftKey && (ev.code === 'KeyR' || ev.key.toLowerCase()==='r')) {
          ev.preventDefault();
          showToast('Forzando recarga de configuración...', 1500);
          const cfgNew = await loadRemoteConfig(true);
          createTriggerIfAllowed(cfgNew);
          showToast('Recarga completada.', 1600);
        }
      });
    }

    (async function init(){
      try {
        const cfg = await loadRemoteConfig(false);
        console.log('OB Multi Tool: config used at init:', cfg);
        createTriggerIfAllowed(cfg);
        setupShortcut();
      } catch(e){
        console.error('OB Multi Tool: init error', e);
      }
    })();

  } catch (fatal) {
    console.error('OB Multi Tool fatal error (script failed to start):', fatal);
  }

})();
