// ==UserScript==
// @name         Extraer visores 180/360 — botón sólo en dominios permitidos
// @namespace    https://github.com/N4m0m0/HV_Misc_Scripts
// @version      1.0.5
// @description  Extrae enlaces 180/360 y copia al portapapeles. El botón sólo aparece en dominios permitidos; la config se gestiona desde repo remoto.
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/Pano_URL_Extractor.js
// @updateURL    https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/Pano_URL_Extractor.js
// ==/UserScript==

(function(){
  'use strict';

  // --- CONFIG (ajusta si necesitas otra ruta) ---
  const CONFIG_URL = 'https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/pano_config.json';
  const LS_KEY = 'pano_extractor_remote_config_v1';
  const DEFAULT_CONFIG = {
    domains: ["*.booking.iberostar.com"],
    patterns: [
      "https?:\\/\\/myr-apiimg\\.iberostar\\.com\\/media\\/(?:360|180)\\/[\\^\\s'\"<>]+\\.html",
      "https?:\\/\\/[^\\/\\s'\"<>]+\\/media\\/(?:360|180)\\/[\\^\\s'\"<>]+\\.html"
    ],
    copyAsCsv: false,
    cacheTTLSeconds: 3600
  };
  const FETCH_TIMEOUT_MS = 8000;

  // --- UTIL fetch con timeout ---
  async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const id = setTimeout(()=> controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {signal: controller.signal, cache: 'no-store'});
      clearTimeout(id);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } finally { clearTimeout(id); }
  }

  // --- cache config ---
  function saveConfigToCache(cfg) {
    try {
      const payload = {cfg: cfg, ts: Date.now()};
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch(e){ console.warn('Pano: cannot save config cache', e); }
  }
  function loadConfigFromCache() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return null;
      return JSON.parse(raw);
    } catch(e) { return null; }
  }

  function buildRegexes(patternStrings) {
    const out = [];
    for(const s of patternStrings || []) {
      try {
        const t = String(s).trim();
        if(!t) continue;
        if(t.startsWith('/') && t.lastIndexOf('/')>0){
          const last = t.lastIndexOf('/');
          const body = t.slice(1,last);
          const flags = t.slice(last+1) || 'ig';
          out.push(new RegExp(body, flags));
        } else {
          out.push(new RegExp(t, 'ig'));
        }
      } catch(e) { console.warn('Pano config: invalid pattern skipped', s, e); }
    }
    return out;
  }

  function domainMatches(pattern, host) {
    pattern = String(pattern).trim().toLowerCase();
    host = String(host).toLowerCase();
    if(pattern === '*' || pattern === '*:*') return true;
    if(pattern.startsWith('*.')){
      const base = pattern.slice(2);
      return host === base || host.endsWith('.' + base);
    }
    return host === pattern || host.endsWith('.' + pattern);
  }

  async function loadRemoteConfig(force=false) {
    const cached = loadConfigFromCache();
    if(!force && cached) {
      const age = (Date.now() - cached.ts) / 1000;
      const ttl = (cached.cfg && Number(cached.cfg.cacheTTLSeconds)) || DEFAULT_CONFIG.cacheTTLSeconds;
      if(age < ttl) return cached.cfg;
    }
    try {
      const txt = await fetchWithTimeout(CONFIG_URL, FETCH_TIMEOUT_MS);
      let parsed = JSON.parse(txt);
      parsed = Object.assign({}, DEFAULT_CONFIG, parsed || {});
      if(!Array.isArray(parsed.domains)) parsed.domains = DEFAULT_CONFIG.domains.slice();
      if(!Array.isArray(parsed.patterns)) parsed.patterns = DEFAULT_CONFIG.patterns.slice();
      saveConfigToCache(parsed);
      console.info('Pano: remote config loaded');
      return parsed;
    } catch(e) {
      console.warn('Pano: failed to load remote config, using cache/default', e);
      if(cached && cached.cfg) return cached.cfg;
      return DEFAULT_CONFIG;
    }
  }

  // --- copy to clipboard ---
  async function copyToClipboard(text) {
    if(navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch(e){}
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position='fixed'; ta.style.left='-9999px';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch(e) { console.warn('Pano copy fallback failed', e); return false; }
  }

  function showToast(msg, t=3000) {
    const id='pano_toast';
    let el = document.getElementById(id);
    if(!el){ el = document.createElement('div'); el.id=id; Object.assign(el.style,{position:'fixed',left:'12px',top:'48px',zIndex:9999999,padding:'8px 12px',background:'rgba(0,0,0,0.85)',color:'#fff',borderRadius:'6px',fontSize:'13px',boxShadow:'0 2px 8px rgba(0,0,0,0.3)'}); document.body.appendChild(el); }
    el.textContent = msg; el.style.display='block'; clearTimeout(el._t); el._t = setTimeout(()=> el.style.display='none', t);
  }

  function findMatchesOnString(text, regexes, add) {
    if(!text) return;
    for(const rx of regexes) {
      try { rx.lastIndex = 0; } catch(e){}
      let m;
      while((m = rx.exec(text)) !== null) add(m[0]);
    }
  }

  async function scanPageAndCopyUsingConfig(cfg) {
    const regexes = buildRegexes(cfg.patterns);
    const found = new Set();
    const addToSet = u => { if(!u) return; try { const url = new URL(u, location.href); url.hash=''; found.add(url.toString()); } catch(e) { found.add(String(u).trim()); } };
    const elems = document.querySelectorAll('iframe, a, link, script, img, source, video, object');
    elems.forEach(el => {
      ['src','href','data-src','data-url','data-href','data-srcset','srcset'].forEach(attr => {
        try {
          const v = el.getAttribute(attr);
          if(!v) return;
          if(attr === 'srcset' || attr === 'data-srcset') {
            v.split(',').forEach(part => {
              const candidate = part.trim().split(/\s+/)[0];
              if(candidate) findMatchesOnString(candidate, regexes, addToSet);
            });
          } else {
            try { const resolved = new URL(v, location.href).href; findMatchesOnString(resolved, regexes, addToSet); }
            catch(e) { findMatchesOnString(v, regexes, addToSet); }
          }
        } catch(e){}
      });
      if(el.tagName === 'SCRIPT' && el.textContent) findMatchesOnString(el.textContent, regexes, addToSet);
    });
    try { const html = document.documentElement.innerHTML; findMatchesOnString(html, regexes, addToSet); } catch(e){}
    if(found.size === 0) { showToast('No se encontraron enlaces con los patrones configurados.', 2800); return; }
    const list = Array.from(found).sort();
    const text = cfg.copyAsCsv ? ('url\n' + list.join('\n')) : list.join('\n');
    const ok = await copyToClipboard(text);
    if(ok) showToast(`Copiados ${list.length} enlaces al portapapeles ✅`, 3000);
    else { showToast('No se pudo copiar. Revisa permisos.', 4000); console.log('Pano links', list); }
  }

  // --- button creation/management (only if domain allowed) ---
  let currentConfig = null;
  function createMainButtonIfAllowed(cfg) {
    // remove existing if any
    const existing = document.getElementById('pano_btn');
    if(existing) existing.remove();

    // check allowed
    const host = location.hostname;
    const allowed = cfg && cfg.domains && cfg.domains.some(p => domainMatches(p, host));
    if(!allowed) {
      console.log('Pano: domain not allowed, button not injected:', host);
      return false;
    }

    const btn = document.createElement('button');
    btn.id = 'pano_btn';
    btn.textContent = 'Copiar enlace 180/360';
    Object.assign(btn.style, {position:'fixed', left:'12px', top:'12px', zIndex:9999999, padding:'8px 12px', background:'#5F4B8B', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.2)'});
    btn.title = 'Clic: extraer (dominio permitido). Click derecho: forzar recarga config';
    btn.addEventListener('click', async () => {
      const cfgNow = await loadRemoteConfig(false);
      if(cfgNow.domains && cfgNow.domains.some(p => domainMatches(p, location.hostname))) {
        await scanPageAndCopyUsingConfig(cfgNow);
      } else {
        showToast('Dominio no permitido (config actual).', 3000);
        console.log('Pano: dominio no permitido at click:', location.hostname);
      }
    });
    btn.addEventListener('contextmenu', async (ev) => {
      ev.preventDefault();
      showToast('Forzando recarga de configuración desde repo...', 1800);
      const cfgNew = await loadRemoteConfig(true);
      if(cfgNew.domains && cfgNew.domains.some(p => domainMatches(p, location.hostname))) {
        createMainButtonIfAllowed(cfgNew);
        showToast('Configuración recargada y dominio permitido — botón activado.', 2200);
      } else {
        showToast('Recargada configuración, dominio sigue sin estar permitido.', 2200);
      }
    });
    document.body.appendChild(btn);
    return true;
  }

  // --- keyboard shortcut: Ctrl+Shift+R to force reload config and (if allowed) show button ---
  async function setupShortcut() {
    window.addEventListener('keydown', async (ev) => {
      if(ev.ctrlKey && ev.shiftKey && (ev.code === 'KeyR' || ev.key === 'R' || ev.key === 'r')) {
        ev.preventDefault();
        showToast('Forzando recarga de configuración...', 1600);
        const cfgNew = await loadRemoteConfig(true);
        currentConfig = cfgNew;
        const created = createMainButtonIfAllowed(cfgNew);
        if(created) showToast('Configuración recargada y botón activado.', 2000);
        else showToast('Configuración recargada — dominio no permitido.', 2000);
      }
    });
  }

  // --- init: fetch config then inject button only if allowed ---
  (async function init(){
    try {
      const cfg = await loadRemoteConfig(false);
      currentConfig = cfg;
      createMainButtonIfAllowed(cfg);
      setupShortcut();
    } catch(e) {
      console.warn('Pano init error', e);
    }
  })();

})();
