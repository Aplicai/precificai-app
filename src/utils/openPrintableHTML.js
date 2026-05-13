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
// Comportamento:
//  1. Cria Blob HTML + URL via URL.createObjectURL
//  2. Dispara <a download> (alguns browsers permitem salvar direto)
//  3. window.open(url, '_blank') — nova aba isolada com o conteúdo
//  4. revokeObjectURL após 10s
//
// Substitui o padrão antigo:
//     const win = window.open('', '_blank');
//     win.document.write(html);
//
// Observação sobre `win.print()`: a chamada automática de print() não funciona
// mais aqui — o usuário aciona Ctrl/Cmd+P ou usa o menu Compartilhar > Imprimir.
// Esta perda é aceitável face ao ganho de segurança; o toast pode orientar.

export function openPrintableHTML(html, filename = 'documento.html') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    // 1) Anchor com download — funciona em desktop e Android
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (_) {}

    // 2) Abrir também em nova aba (origin opaca — defense-in-depth XSS)
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (_) {}

    // 3) Libera memória depois de tempo razoável p/ o browser concluir
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 10000);
    return true;
  } catch (e) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[openPrintableHTML]', e);
    }
    return false;
  }
}

export default openPrintableHTML;
