// ==UserScript==
// @name         Extractor visores 180/360 — Sólo en dominios permitidos
// @namespace    https://github.com/N4m0m0/HV_Misc_Scripts
// @version      1.0.9
// @description  Extrae enlaces 180/360 y copia al portapapeles. El botón sólo aparece en dominios permitidos; la config se gestiona desde repo remoto.
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/Pano_URL_Extractor.js
// @updateURL    https://raw.githubusercontent.com/N4m0m0/HV_Misc_Scripts/main/Pano_URL_Extractor.js
// ==/UserScript==



(function(){
  const PAT = /https?:\/\/myr-apiimg\.iberostar\.com\/media\/(?:180|360)\/[^\s'"<>]+\.html/ig;

  // copia al portapapeles (async). Usa navigator.clipboard si está, si no, fallback execCommand.
  async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        // fallthrough al fallback
      }
    }
    // fallback clásico
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
    } catch (e) {
      return false;
    }
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
    el._hideTimer = setTimeout(()=>{ el.style.display = 'none'; }, timeout);
  }

  async function scanAndCopy(){
    const found = new Set();
    // buscar en atributos comunes
    document.querySelectorAll('iframe, a, link, script').forEach(el=>{
      ['src','href','data-src','data-url'].forEach(attr=>{
        try{
          let v = el.getAttribute(attr);
          if(v){
            try{ v = (new URL(v, location.href)).href }catch(e){}
            let m;
            while((m = PAT.exec(v)) !== null) found.add(m[0]);
          }
        }catch(e){}
      });
      if(el.tagName==='SCRIPT' && el.textContent){
        let m;
        while((m = PAT.exec(el.textContent)) !== null) found.add(m[0]);
      }
    });
    // buscar en el HTML completo (por si queda en inline)
    let mm;
    while((mm = PAT.exec(document.documentElement.innerHTML)) !== null) found.add(mm[0]);

    if(found.size===0){
      showToast('No se encontraron enlaces myr-apiimg en esta página.', 3500);
      return;
    }

    // preparar texto para copiar: una URL por línea (puedes cambiar a CSV si prefieres)
    const list = Array.from(found);
    // opcional: ordenamos para consistencia
    list.sort();
    const text = list.join('\n');

    const ok = await copyToClipboard(text);
    if(ok){
      showToast(`Copiados ${list.length} enlaces al portapapeles ✅`, 3500);
      console.log('myr360 links copied:', list);
    } else {
      showToast('Error: no se pudo copiar al portapapeles. Revisa permisos.', 5000);
      console.log('myr360 links (no copiados):', list);
    }
  }

  // botón en top-left
  const btn = document.createElement('button');
  btn.textContent = 'Copiar 180/360';
  Object.assign(btn.style, {
    position:'fixed',
    left:'22px',
    top:'82px',
    zIndex:999999,
    padding:'8px 12px',
    background:'#1976D2',
    color:'#fff',
    border:'none',
    borderRadius:'6px',
    cursor:'pointer',
    boxShadow:'0 2px 6px rgba(0,0,0,0.2)'
  });
  btn.addEventListener('click', scanAndCopy);
  document.body.appendChild(btn);
})();

// --- Dominios permitidos (usa el dominio base; vale con subdominios) ---
const ALLOWED_DOMAINS = [
  "booking.iberostar.com",
  "iberostar.com"
];

function isAllowedHost(host) {
  host = host.toLowerCase();
  return ALLOWED_DOMAINS.some(d => host === d || host.endsWith("." + d));
}

// Si no estamos en un dominio permitido, no inyectar nada
if (!isAllowedHost(location.hostname)) return;
