// Peças visuais dos e-mails do Precificaí: cores, fonte, componentes e moldura.
// Puro (sem Deno/rede): roda também no Node para testes e prévia.

export const APP = 'https://app.precificaiapp.com/';
export const VIDEO = 'https://youtu.be/qG2BFhvEFkU';

export type Estagio = 'sem_perfil' | 'sem_ingrediente' | 'kit_sem_preco' | 'sem_produto' | 'produto_sem_preco' | 'ativo';

// Imagens servidas pela landing (precificai-site/assets/email/).
export const IMG = 'https://precificaiapp.com/assets/email';

// Capítulos do vídeo "Primeiros passos" (mesmos de src/config/tutorial.js).
export const CAP = {
  abertura: { t: 0, titulo: 'Do primeiro acesso ao primeiro preço' },
  primeiroAcesso: { t: 17, titulo: 'Primeiro acesso e Kit de Início' },
  ingrediente: { t: 173, titulo: 'Cadastrando o primeiro ingrediente' },
  produto: { t: 211, titulo: 'Montando o produto e vendo o preço sugerido' },
  proximos: { t: 265, titulo: 'Próximos passos' },
};
export type Capitulo = (typeof CAP)[keyof typeof CAP];

// Jornada até o primeiro preço. `passo` = quantos já foram feitos.
export const JORNADA = ['Seu negócio', 'Ingredientes', 'Produto', 'Preço'];

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Textos de ETAPAS/PRO/NOVIDADES são nossos e podem ter <b>; no texto puro, sai a marcação. */
export function semTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

export function tempo(seg: number): string {
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
}

export function urlVideo(c: Capitulo): string {
  return `${VIDEO}${c.t > 0 ? `?t=${c.t}` : ''}`;
}

export const FONTE = "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const COR = {
  verde: '#004d47', verdeEscuro: '#003833', menta: '#00c9a7', amarelo: '#e3b842', amareloClaro: '#fff4d6',
  fundo: '#f4f6f5', texto: '#1a1a2e', corpo: '#3d4a48', suave: '#6b7d7b', borda: '#d8e0de', verdeClaro: '#e8f3f2',
};

export const par = (t: string, extra = '') =>
  `<p style="margin:0 0 16px 0;font-family:${FONTE};font-size:16px;line-height:26px;color:${COR.corpo};${extra}">${t}</p>`;

export function htmlLista(itens: string[], numerada: boolean): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 20px 0;">${itens
    .map((item, i) => `<tr>
      <td width="36" valign="top" style="padding:0 0 12px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;border-radius:13px;background-color:${numerada ? COR.verde : COR.verdeClaro};font-family:${FONTE};font-size:13px;font-weight:700;line-height:26px;color:${numerada ? '#ffffff' : COR.verde};">${numerada ? i + 1 : '&#10003;'}</td></tr></table>
      </td>
      <td valign="top" style="padding:1px 0 12px 0;font-family:${FONTE};font-size:16px;line-height:24px;color:${COR.corpo};">${item}</td>
    </tr>`).join('')}</table>`;
}

export function htmlJornada(passo: number): string {
  const celulas = JORNADA.map((nome, i) => {
    const feito = i < passo;
    const atual = i === passo;
    const bola = feito
      ? `background-color:${COR.verde};color:#ffffff;`
      : atual
        ? `background-color:${COR.amareloClaro};color:${COR.verdeEscuro};border:2px solid ${COR.amarelo};`
        : `background-color:${COR.fundo};color:${COR.suave};border:2px solid ${COR.borda};`;
    const tam = feito ? 28 : 24; // com borda de 2px, todas ficam com 28px
    return `<td width="25%" align="center" valign="top" style="padding:0 2px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="${tam}" height="${tam}" align="center" valign="middle" style="width:${tam}px;height:${tam}px;border-radius:14px;${bola}font-family:${FONTE};font-size:13px;font-weight:700;line-height:${tam}px;">${feito ? '&#10003;' : i + 1}</td></tr></table>
      <div style="margin-top:6px;font-family:${FONTE};font-size:12px;line-height:16px;font-weight:${atual ? 700 : 500};color:${feito || atual ? COR.verdeEscuro : COR.suave};">${nome}</div>
    </td>`;
  }).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px 0;background-color:${COR.fundo};border-radius:12px;"><tr><td style="padding:16px 8px 14px 8px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>${celulas}</tr></table>
  </td></tr></table>`;
}

export function htmlExemplo(e: { frase: string; resultado: string }): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px 0;border:1px solid ${COR.borda};border-radius:12px;"><tr><td style="padding:18px 20px;">
    <div style="font-family:${FONTE};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COR.suave};margin-bottom:8px;">Você escreve</div>
    <div style="font-family:${FONTE};font-size:20px;line-height:28px;color:${COR.texto};">${e.frase}</div>
    <div style="height:1px;line-height:1px;font-size:1px;background-color:${COR.borda};margin:14px 0;">&nbsp;</div>
    <div style="font-family:${FONTE};font-size:15px;line-height:22px;color:${COR.verde};font-weight:600;">${e.resultado}</div>
  </td></tr></table>`;
}

export function htmlDica(t: string): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;"><tr>
    <td width="4" style="width:4px;background-color:${COR.amarelo};border-radius:2px;">&nbsp;</td>
    <td style="padding:14px 18px;background-color:${COR.amareloClaro};border-radius:0 10px 10px 0;font-family:${FONTE};font-size:15px;line-height:23px;color:${COR.verdeEscuro};">${t}</td>
  </tr></table>`;
}

export function htmlPreco(): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px 0;border:1px solid ${COR.borda};border-radius:12px;"><tr>
    <td width="50%" valign="top" style="padding:16px 18px;border-right:1px solid ${COR.borda};">
      <div style="font-family:${FONTE};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COR.suave};">Mensal no cartão</div>
      <div style="font-family:${FONTE};font-size:24px;line-height:32px;font-weight:700;color:${COR.texto};margin-top:4px;">R$ 29,90</div>
      <div style="font-family:${FONTE};font-size:13px;line-height:18px;color:${COR.suave};">por mês</div>
    </td>
    <td width="50%" valign="top" style="padding:16px 18px;">
      <div style="font-family:${FONTE};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COR.suave};">Anual no Pix</div>
      <div style="font-family:${FONTE};font-size:24px;line-height:32px;font-weight:700;color:${COR.texto};margin-top:4px;">R$ 322,90</div>
      <div style="font-family:${FONTE};font-size:13px;line-height:18px;color:${COR.suave};">por ano, sai R$ 26,91 por mês</div>
    </td>
  </tr></table>`;
}

// ---------- régua: componentes novos e moldura com 6 formatos ----------

export type Formato = 'passo' | 'painel' | 'tela' | 'carta' | 'mito' | 'checklist';

/** Números grandes (formato painel). Até 3 por linha. */
export function htmlNumeros(itens: { valor: string; rotulo: string; destaque?: boolean }[]): string {
  const w = Math.floor(100 / itens.length);
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;"><tr>${itens
    .map((n) => `<td width="${w}%" valign="top" style="padding:0 4px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${n.destaque ? COR.amareloClaro : COR.verdeClaro};border-radius:14px;"><tr><td align="center" style="padding:20px 8px 18px 8px;">
        <div style="font-family:${FONTE};font-size:38px;line-height:44px;font-weight:700;color:${n.destaque ? COR.verdeEscuro : COR.verde};">${esc(n.valor)}</div>
        <div style="margin-top:6px;font-family:${FONTE};font-size:13px;line-height:18px;font-weight:600;color:${COR.corpo};">${esc(n.rotulo)}</div>
      </td></tr></table>
    </td>`).join('')}</tr></table>`;
}

/** Mito x verdade (formato mito). Textos nossos, podem ter <b>. */
export function htmlMito(mito: string, verdade: string): string {
  const caixa = (rotulo: string, cor: string, fundo: string, t: string, riscado: boolean) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 14px 0;background-color:${fundo};border-radius:12px;"><tr><td style="padding:18px 20px;">
      <div style="font-family:${FONTE};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${cor};margin-bottom:8px;">${rotulo}</div>
      <div style="font-family:${FONTE};font-size:18px;line-height:27px;color:${COR.texto};${riscado ? 'text-decoration:line-through;text-decoration-color:#c0392b;' : ''}">${t}</div>
    </td></tr></table>`;
  return caixa('Mito', '#c0392b', '#fdeeee', mito, true) + caixa('Verdade', COR.verde, COR.verdeClaro, verdade, false) + '<div style="height:10px;line-height:10px;font-size:1px;">&nbsp;</div>';
}

/** Lista feito / falta (formato checklist). */
export function htmlChecklist(itens: { feito: boolean; texto: string }[]): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;border:1px solid ${COR.borda};border-radius:12px;">${itens
    .map((it, i) => `<tr><td style="padding:14px 18px;${i ? `border-top:1px solid ${COR.borda};` : ''}">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
        <td width="34" valign="middle"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="24" height="24" align="center" valign="middle" style="width:24px;height:24px;border-radius:6px;${it.feito ? `background-color:${COR.verde};color:#ffffff;` : `border:2px solid ${COR.amarelo};width:20px;height:20px;`}font-family:${FONTE};font-size:14px;font-weight:700;line-height:20px;">${it.feito ? '&#10003;' : '&nbsp;'}</td></tr></table></td>
        <td valign="middle" style="font-family:${FONTE};font-size:16px;line-height:23px;color:${it.feito ? COR.suave : COR.texto};font-weight:${it.feito ? 400 : 600};">${it.texto}</td>
      </tr></table>
    </td></tr>`).join('')}</table>`;
}

/** Print de tela clicável (formato tela). */
export function htmlTela(arquivo: string, alt: string, link: string, legenda?: string): string {
  return `<a href="${link}" style="text-decoration:none;display:block;margin:0 0 ${legenda ? 12 : 24}px 0;">
      <img src="${IMG}/telas/${arquivo}" width="520" alt="${esc(alt)}" style="display:block;width:100%;max-width:520px;height:auto;border:1px solid ${COR.borda};border-radius:12px;">
    </a>${legenda ? `<p style="margin:0 0 24px 0;font-family:${FONTE};font-size:14px;line-height:21px;color:${COR.suave};">${legenda}</p>` : ''}`;
}

/** Cartão de vídeo do YouTube (capa genérica + título do tutorial). */
export function htmlVideo(url: string, titulo: string, duracao: string): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;border:1px solid ${COR.borda};border-radius:12px;"><tr>
    <td width="64" valign="middle" style="padding:14px 0 14px 16px;"><a href="${url}" style="text-decoration:none;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="48" height="48" align="center" valign="middle" bgcolor="${COR.verde}" style="width:48px;height:48px;border-radius:24px;background-color:${COR.verde};font-family:${FONTE};font-size:18px;line-height:48px;color:#ffffff;">&#9654;</td></tr></table></a></td>
    <td valign="middle" style="padding:14px 16px;">
      <div style="font-family:${FONTE};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COR.suave};">Vídeo · ${esc(duracao)}</div>
      <a href="${url}" style="font-family:${FONTE};font-size:16px;line-height:23px;font-weight:700;color:${COR.verde};text-decoration:none;">${esc(titulo)}</a>
    </td>
  </tr></table>`;
}

export interface Moldura {
  formato: Formato;
  assunto: string;
  previa: string;
  selo: string;
  titulo: string;
  corpo: string;          // HTML já montado
  link: string;           // destino do botão / link
  cta: string;
  linkSair: string;
}

/**
 * Moldura fixa da marca (logo, paleta, fonte, rodapé) com o miolo de cada formato:
 *   passo/painel/tela → cabeçalho verde, botão cheio
 *   mito              → cabeçalho amarelo-claro, botão cheio
 *   checklist         → cabeçalho verde-claro, botão cheio
 *   carta             → sem cabeçalho colorido, link no texto, assinatura pessoal
 */
export function moldura(m: Moldura): string {
  const cab = {
    passo: { fundo: COR.verde, selo: COR.amarelo, titulo: '#ffffff', logo: 'logo-email-branca.png' },
    painel: { fundo: COR.verdeEscuro, selo: COR.menta, titulo: '#ffffff', logo: 'logo-email-branca.png' },
    tela: { fundo: COR.verde, selo: COR.menta, titulo: '#ffffff', logo: 'logo-email-branca.png' },
    mito: { fundo: COR.amareloClaro, selo: '#b8860b', titulo: COR.verdeEscuro, logo: 'logo-email-verde.png' },
    checklist: { fundo: COR.verdeClaro, selo: COR.verde, titulo: COR.verdeEscuro, logo: 'logo-email-verde.png' },
    carta: null,
  }[m.formato];

  const cabecalho = cab
    ? `<tr><td style="background-color:${cab.fundo};border-radius:20px 20px 0 0;" bgcolor="${cab.fundo}">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td class="px" style="padding:32px 40px 36px 40px;">
        <a href="${m.link}" style="text-decoration:none;"><img src="${IMG}/${cab.logo}" width="132" height="23" alt="Precificaí" style="display:block;width:132px;height:auto;border:0;color:${cab.titulo};font-family:${FONTE};font-size:20px;font-weight:700;"></a>
        <div style="height:32px;line-height:32px;font-size:1px;">&nbsp;</div>
        <div style="font-family:${FONTE};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${cab.selo};margin-bottom:10px;">${esc(m.selo)}</div>
        <h1 class="titulo" style="margin:0;font-family:${FONTE};font-size:30px;line-height:38px;font-weight:700;color:${cab.titulo};">${esc(m.titulo)}</h1>
      </td></tr></table>
    </td></tr>`
    : `<tr><td style="background-color:#ffffff;border-radius:20px 20px 0 0;border-bottom:1px solid ${COR.borda};" bgcolor="#ffffff">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td class="px" style="padding:28px 40px 24px 40px;">
        <a href="${m.link}" style="text-decoration:none;"><img src="${IMG}/logo-email-verde.png" width="110" height="19" alt="Precificaí" style="display:block;width:110px;height:auto;border:0;color:${COR.verde};font-family:${FONTE};font-size:18px;font-weight:700;"></a>
      </td></tr></table>
    </td></tr>`;

  const carta = m.formato === 'carta';
  const acao = carta
    ? `<tr><td class="px" style="padding:0 40px 8px 40px;">${par(`<a href="${m.link}" style="color:${COR.verde};font-weight:700;">${esc(m.cta)}&nbsp;&rarr;</a>`, 'font-size:17px;')}</td></tr>`
    : `<tr><td class="px botao" style="padding:4px 40px 32px 40px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="${COR.verde}" style="background-color:${COR.verde};border-radius:12px;">
            <a href="${m.link}" style="display:inline-block;padding:16px 32px;font-family:${FONTE};font-size:17px;line-height:22px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${esc(m.cta)}&nbsp;&rarr;</a>
          </td></tr></table>
        </td></tr>`;

  const assinatura = carta
    ? par(`Um abraço,<br><b style="color:${COR.texto};">Equipe Precificaí</b><br><span style="font-size:13px;color:${COR.suave};">Responda este e-mail: quem lê é gente, não robô.</span>`, 'margin:0;font-size:15px;line-height:23px;')
    : `<div style="height:1px;line-height:1px;font-size:1px;background-color:${COR.borda};margin:0 0 24px 0;">&nbsp;</div>
          ${par('Ficou alguma dúvida? Responda este e-mail que a gente ajuda.', 'margin:0 0 4px 0;font-size:15px;line-height:23px;')}
          ${par(`Um abraço,<br><b style="color:${COR.texto};">Equipe Precificaí</b>`, 'margin:0;font-size:15px;line-height:23px;')}`;

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(m.assunto)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { color:${COR.verde}; }
  @media (max-width:600px) {
    .px { padding-left:24px !important; padding-right:24px !important; }
    .titulo { font-size:25px !important; line-height:32px !important; }
    .botao a { display:block !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${COR.fundo};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(m.previa)}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${COR.fundo};">
<tr><td align="center" style="padding:32px 12px 40px 12px;">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">
    ${cabecalho}
    <tr><td style="background-color:#ffffff;" bgcolor="#ffffff">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr><td class="px" style="padding:${carta ? '32px' : '36px'} 40px 4px 40px;">${m.corpo}</td></tr>
        ${acao}
        <tr><td class="px" style="padding:${carta ? '8px' : '0'} 40px 36px 40px;">
          ${assinatura}
        </td></tr>
      </table>
    </td></tr>
    <tr><td height="6" style="height:6px;line-height:6px;font-size:1px;background-color:${COR.menta};border-radius:0 0 20px 20px;" bgcolor="${COR.menta}">&nbsp;</td></tr>
    <tr><td align="center" class="px" style="padding:28px 40px 0 40px;">
      <img src="${IMG}/logo-email-verde.png" width="96" height="17" alt="Precificaí" style="display:block;width:96px;height:auto;border:0;margin:0 auto 14px auto;">
      <p style="margin:0 0 8px 0;font-family:${FONTE};font-size:12px;line-height:19px;color:${COR.suave};">Você recebe este e-mail porque criou uma conta no Precificaí.<br><a href="${m.linkSair}" style="color:${COR.suave};text-decoration:underline;">Não quero mais receber dicas</a></p>
      <p style="margin:0;font-family:${FONTE};font-size:11px;line-height:17px;color:#9aa8a6;">APLICAI CONSULTORIA E TREINAMENTO LTDA &middot; CNPJ 53.054.196/0001-63<br>Juiz de Fora, MG</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`.replace(/R\$ (?=\d)/g, () => 'R$&nbsp;');
}
