// ==UserScript==
// @name         OB Multi Tool — buscador robusto (config local, shadow DOM, reintentos)
// @namespace    https://github.com/N4m0m0/HV_Misc_Scripts
// @version      1.0.5
// @description  Panel con campo + botones. Inyección robusta: shadow DOM, reintentos, escucha SPA. Configuración embebida (sin fetch remoto).
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function(){
  'use strict';
  try {
    console.log('OB Multi Tool started (local config)');

    // ---------- CONFIG (LOCAL: edítalo aquí) ----------
    // Dominios permitidos: usa '*' para permitir en todos los host.
    // Puedes usar comodines en cualquier parte: '*reservation.barcelo.*', '*.barcelo.com', 'reservation.barcelo.com', etc.
    const DEFAULT_CONFIG = {
      domains: [
        '*reservation.barcelo.*',
        'reservation.barcelo.*'
        // '*' // -> descomenta si quieres forzar en todas las webs
      ],
      // otras claves que quieras añadir en el futuro:
    };

    // ---------- UTILIDADES ----------
    // domainMatches: soporte de "glob" con '*' en cualquier posición.
    function domainMatches(pattern, host) {
      try {
        pattern = String(pattern || '').trim().toLowerCase();
        host = String(host || '').toLowerCase();
        if (!pattern) return false;
        if (pattern === '*' || pattern === '*:*') return true;

        // Escape regex special chars, then replace '*' por '.*'
        const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        const re = new RegExp('^' + escaped + '$');
        return re.test(host);
      } catch (e) {
        console.warn('OB Multi Tool: domainMatches error', e);
        return false;
      }
    }

    // ---------- UI (shadow DOM) ----------
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
            <button id="ob_multi_rcodes" class="btn rc">Room-Codes</button>
            <button id="ob_multi_hcode" class="btn hc">Hotel-Code</button>
          </div>
          <div class="hint">Introduce texto y pulsa un botón.</div>
        </div>
      `;
      return html;
    }

    function createShadowButtonAndPanel(rootContainerId = 'ob_multi_host') {
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
          const host = location.hostname;
          if(!(cfg.domains && cfg.domains.some(p => domainMatches(p, host)))) {
            console.log('OB Multi Tool: domain not allowed at ensureInjected:', host);
            return false;
          }
          const ok = createShadowButtonAndPanel();
          if(ok) {
            console.log('OB Multi Tool: trigger injected (attempt', i+1, ')');
            return true;
          }
        } catch(e) {
          console.warn('OB Multi Tool: injection attempt error', e);
        }
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
          showToast('Recargando configuración local...', 1400);
          // recarga la configuración local (en este caso DEFAULT_CONFIG)
          const cfgNew = DEFAULT_CONFIG;
          await ensureInjectedWithRetries(cfgNew);
          showToast('Recarga completada', 1200);
        }
      });
    }

    // ----- init -----
    (async function init(){
      try {
        const cfg = DEFAULT_CONFIG; // usamos la config embebida (sin fetch remoto)
        console.log('OB Multi Tool: config used at init (local):', cfg);
        const injected = await ensureInjectedWithRetries(cfg);
        if(injected) {
          setupMutationWatch(cfg);
          setupHistoryHook(cfg);
          setupShortcut(cfg);
          console.log('OB Multi Tool: fully initialized (local config)');
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
