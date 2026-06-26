#!/usr/bin/env node
/**
 * inject-boot-watchdog.js — CAMADA 3 do "PWA não carrega / fica rodando".
 *
 * O `expo export` gera um `dist/index.html` com `<div id="root"></div>` VAZIO e
 * sem nenhum indicador de carregamento. Se o boot travar (bundle 404, chunk lazy
 * faltando, promise pendurada, conexão ruim), o usuário fica olhando uma tela em
 * branco/spinner do SO PRA SEMPRE, sem erro e sem saída.
 *
 * Este script (versionado, idempotente) injeta no `index.html` GERADO:
 *   1. Um spinner visível imediato (overlay) com a identidade visual do app.
 *   2. Um watchdog que detecta se o React montou (MutationObserver no #root):
 *      - Montou  → esconde o overlay (transição limpa).
 *      - NÃO montou em 12s → recuperação:
 *          • 1ª vez: auto-reload UMA vez limpando SW + caches (travado por
 *            sessionStorage → SEM loop, honra a INVARIANTE DE OURO do sw.js).
 *          • Se ainda falhar → botão "Recarregar" manual.
 *
 * Chamado pelo scripts/deploy-web.sh logo após o `expo export`, ANTES de
 * sincronizar pra .vercel/output/static. Patcha os dois index.html (dist + static)
 * caso já existam. CSP permite inline (`script-src 'unsafe-inline'`).
 */
const fs = require('fs');
const path = require('path');

const TARGETS = [
  path.join(__dirname, '..', 'dist', 'index.html'),
  path.join(__dirname, '..', '.vercel', 'output', 'static', 'index.html'),
];
const MARKER = 'boot-watchdog-v1';

// Spinner overlay — IRMÃO do #root (não mexe no container do React).
const SPINNER_HTML =
  '<div id="boot-spinner" style="position:fixed;inset:0;display:flex;flex-direction:column;' +
  'align-items:center;justify-content:center;background:#F4F6F5;z-index:99999;' +
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#004d47\">" +
  '<div style="width:42px;height:42px;border:4px solid #cfe0dd;border-top-color:#004d47;' +
  'border-radius:50%;animation:bootspin .8s linear infinite"></div>' +
  '<div style="margin-top:16px;font-size:15px;opacity:.8">Carregando…</div>' +
  '</div><style>@keyframes bootspin{to{transform:rotate(360deg)}}</style>';

const WATCHDOG_SCRIPT =
  '<script>/* ' + MARKER + ' */\n' +
  '(function(){\n' +
  '  var RECOVER_MS=12000;\n' +
  '  function root(){return document.getElementById("root");}\n' +
  '  function sp(){return document.getElementById("boot-spinner");}\n' +
  '  function mounted(){var r=root();return !!(r&&r.childElementCount>0);}\n' +
  '  function hide(){var s=sp();if(s&&s.parentNode)s.parentNode.removeChild(s);}\n' +
  '  function clearRetry(){try{sessionStorage.removeItem("boot_retry");}catch(e){}}\n' +
  '  function hardReload(){\n' +
  '    var go=function(){location.replace(location.pathname+"?r="+Date.now());};\n' +
  '    try{\n' +
  '      var p=[];\n' +
  '      if("serviceWorker" in navigator){p.push(navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister();}));}).catch(function(){}));}\n' +
  '      if(window.caches&&caches.keys){p.push(caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k);}));}).catch(function(){}));}\n' +
  '      Promise.all(p).then(go,go);\n' +
  '      setTimeout(go,2500);\n' +
  '    }catch(e){go();}\n' +
  '  }\n' +
  '  function showButton(){\n' +
  '    var s=sp();if(!s)return;\n' +
  '    s.innerHTML=\'<div style="font-size:16px;font-weight:600;margin-bottom:8px">O app não carregou</div>\'+\n' +
  '      \'<div style="font-size:13px;opacity:.7;margin-bottom:20px;text-align:center;max-width:280px;line-height:1.4">Pode ser a conexão. Toque abaixo para recarregar limpando o cache.</div>\'+\n' +
  '      \'<button id="boot-reload" style="background:#004d47;color:#fff;border:none;border-radius:10px;padding:13px 26px;font-size:15px;font-weight:600;cursor:pointer">Recarregar</button>\';\n' +
  '    var b=document.getElementById("boot-reload");if(b)b.onclick=hardReload;\n' +
  '  }\n' +
  '  function recover(){\n' +
  '    if(mounted()){hide();clearRetry();return;}\n' +
  '    try{if(!sessionStorage.getItem("boot_retry")){sessionStorage.setItem("boot_retry","1");hardReload();return;}}catch(e){}\n' +
  '    showButton();\n' +
  '  }\n' +
  '  // Detecta montagem do React no #root e esconde o overlay na hora.\n' +
  '  try{\n' +
  '    var r=root();\n' +
  '    if(r&&window.MutationObserver){\n' +
  '      var mo=new MutationObserver(function(){if(mounted()){mo.disconnect();hide();clearRetry();}});\n' +
  '      mo.observe(r,{childList:true});\n' +
  '    }\n' +
  '  }catch(e){}\n' +
  '  // Fallback de polling (caso MutationObserver falhe) + verificação inicial.\n' +
  '  var poll=setInterval(function(){if(mounted()){clearInterval(poll);hide();clearRetry();}},300);\n' +
  '  setTimeout(recover,RECOVER_MS);\n' +
  '})();\n' +
  '</script>';

function patch(file) {
  if (!fs.existsSync(file)) return false;
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes(MARKER)) {
    console.log('[inject-boot-watchdog] já presente, pula:', file);
    return true;
  }
  // 1) overlay de spinner como IRMÃO do #root (logo após o </div> do root vazio).
  if (html.includes('<div id="root"></div>')) {
    html = html.replace('<div id="root"></div>', '<div id="root"></div>' + SPINNER_HTML);
  } else {
    console.warn('[inject-boot-watchdog] <div id="root"></div> não encontrado em', file, '— injetando só o script.');
  }
  // 2) watchdog antes do </body>.
  if (html.includes('</body>')) {
    html = html.replace('</body>', WATCHDOG_SCRIPT + '\n</body>');
  } else {
    html += WATCHDOG_SCRIPT;
  }
  fs.writeFileSync(file, html);
  console.log('[inject-boot-watchdog] injetado em', file);
  return true;
}

let any = false;
for (const t of TARGETS) {
  if (patch(t)) any = true;
}
if (!any) {
  console.error('[inject-boot-watchdog] ERRO: nenhum index.html encontrado em', TARGETS.join(', '));
  process.exit(1);
}
