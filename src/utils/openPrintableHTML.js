// Defense-in-depth XSS: abre HTML gerado pelo app em uma origem isolada
// (Blob URL — origem opaca/null) ao invés de `document.write` em `window.open('', '_blank')`.
//
// O motivo: PDFs/relatórios incluem dados livres do usuário (nome do negócio,
// nome de produtos, observações). Se algum escape falhar, um `document.write`
// em uma aba que herda `window.location.origin` da app daria ao atacante
// acesso total ao localStorage (incluindo o token do Supabase).
//
// Blob URLs criam uma origem opaca isolada — script no documento gerado NÃO
// consegue ler localStorage/cookies da origem principal.
//
// Comportamento (gera PDF de verdade, não baixa .html; NÃO usa popup):
//  1. Injeta um <title> (vira o nome sugerido em "Salvar como PDF")
//  2. Injeta um <script> que chama window.print() ao carregar
//  3. Cria Blob HTML + URL via URL.createObjectURL
//  4. Renderiza num IFRAME OCULTO sandboxed (NÃO é popup → não dá pra bloquear)
//     que se auto-imprime → abre DIRETO o diálogo de impressão
//  5. remove o iframe + revokeObjectURL após 60s
//
// QA fix: o padrão anterior usava window.open(url,'_blank'), que os navegadores
// BLOQUEIAM como popup (a chamada acontece após trabalho assíncrono de geração
// do HTML, fora do "gesto do usuário"). O iframe oculto contorna isso e abre
// direto na impressão.
//
// Segurança: o iframe usa sandbox="allow-scripts allow-modals" (SEM
// allow-same-origin) → origem OPACA garantida. O <script> injetado roda nessa
// origem isolada — NÃO lê localStorage/cookies/token da app, então a defesa XSS
// por isolamento de origem é mantida (e até reforçada vs. blob top-level). O
// script é string fixa controlada por nós. No iOS Safari o print() pode não
// disparar automaticamente; o toast do caller orienta o usuário.

export function openPrintableHTML(html, filename = 'documento') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    // Nome sugerido no diálogo "Salvar como PDF": tira extensão .html e chars perigosos.
    const safeTitle = String(filename || 'documento')
      .replace(/\.html?$/i, '')
      .replace(/[<>&"]/g, '')
      .trim() || 'documento';

    // Script que dispara o diálogo de impressão (concatenado p/ não fechar a tag cedo).
    const printScript =
      '<scr' + 'ipt>(function(){function p(){try{window.focus();window.print();}catch(e){}}' +
      "if(document.readyState==='complete'){setTimeout(p,350);}" +
      "else{window.addEventListener('load',function(){setTimeout(p,350);});}})();</scr" + 'ipt>';

    let out = String(html);
    // Garante/atualiza o <title> para o nome do arquivo PDF.
    if (/<title>[\s\S]*?<\/title>/i.test(out)) {
      out = out.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + safeTitle + '</title>');
    } else if (/<head[^>]*>/i.test(out)) {
      out = out.replace(/(<head[^>]*>)/i, '$1<title>' + safeTitle + '</title>');
    }
    // Injeta o auto-print logo antes de fechar o body.
    out = /<\/body>/i.test(out)
      ? out.replace(/<\/body>/i, printScript + '</body>')
      : out + printScript;

    const blob = new Blob([out], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    // iOS Safari/WebKit: print() em iframe oculto é não-confiável E não haveria
    // aba visível pra o usuário usar Compartilhar > Imprimir. Então no iOS
    // mantemos a nova aba (window.open) + o toast orienta "Compartilhar".
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const isIOS = /iP(hone|ad|od)/i.test(ua)
      || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (_) {}
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 60000);
      return true;
    }

    // QA fix: ANTES usava window.open(url) — bloqueado como POPUP pelo navegador
    // (a chamada vinha depois de trabalho assíncrono, perdendo o "gesto do
    // usuário"). Agora renderiza num IFRAME OCULTO na própria página: NÃO é
    // popup (não dá pra bloquear) e o <script> injetado dispara window.print()
    // → abre DIRETO o diálogo de impressão / "Salvar como PDF".
    //
    // Segurança: sandbox SEM allow-same-origin = origem opaca garantida → o doc
    // gerado (que inclui dados livres do usuário) NÃO lê localStorage/token da
    // app, mesmo se algum escape falhar. allow-scripts roda o auto-print;
    // allow-modals permite o diálogo de impressão.
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('sandbox', 'allow-scripts allow-modals');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    iframe.src = url;
    document.body.appendChild(iframe);

    // Remove o iframe + revoga a URL depois que o diálogo de impressão já abriu.
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch (_) {}
      try { iframe.remove(); } catch (_) {}
    }, 60000);
    return true;
  } catch (e) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[openPrintableHTML]', e);
    }
    return false;
  }
}

export default openPrintableHTML;
