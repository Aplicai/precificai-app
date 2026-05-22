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
// Comportamento (gera PDF de verdade, não baixa .html):
//  1. Injeta um <title> (vira o nome sugerido em "Salvar como PDF")
//  2. Injeta um <script> que chama window.print() ao carregar
//  3. Cria Blob HTML + URL via URL.createObjectURL (origem opaca)
//  4. window.open(url, '_blank') — nova aba isolada que se auto-imprime
//  5. revokeObjectURL após 60s (tempo do diálogo de impressão ficar aberto)
//
// Substitui o padrão antigo:
//     const win = window.open('', '_blank');
//     win.document.write(html);
//
// Sobre o auto-print: o <script> injetado roda DENTRO do documento Blob, na
// origem OPACA — ele NÃO consegue ler localStorage/cookies da app, então a
// defesa XSS por isolamento de origem continua intacta. O script é uma string
// fixa controlada por nós (não vem de dados do usuário). No iOS Safari o
// print() pode não disparar; nesse caso a aba abre com o conteúdo e o usuário
// usa Compartilhar > Imprimir (o toast já orienta).

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

    // Abre em nova aba (origem opaca — defense-in-depth XSS). O script injetado
    // chama window.print() → o usuário escolhe "Salvar como PDF".
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (_) {}

    // Mantém a URL viva tempo suficiente p/ o diálogo de impressão concluir.
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 60000);
    return true;
  } catch (e) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[openPrintableHTML]', e);
    }
    return false;
  }
}

export default openPrintableHTML;
