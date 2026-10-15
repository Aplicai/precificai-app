// E-mails d1, d3 e campanhas avulsas (reativação). A régua semanal fica em regua.ts.

import {
  APP, CAP, COR, FONTE, IMG, JORNADA, VIDEO, esc, htmlDica, htmlExemplo, htmlJornada, htmlLista, htmlPreco,
  par, semTags, tempo, urlVideo,
} from './layout.ts';
import type { Capitulo, Estagio } from './layout.ts';

interface Bloco {
  assunto: string;
  previa: string;          // texto que aparece ao lado do assunto na caixa de entrada
  selo: string;            // linha pequena acima do título
  titulo: string;
  paragrafos: string[];
  exemplo?: { frase: string; resultado: string };
  dica?: string;
  lista?: string[];
  numerada?: boolean;
  preco?: boolean;
  cta: string;
  passo?: number;
  video?: Capitulo;
}

const ETAPAS: Record<Estagio, Bloco> = {
  sem_perfil: {
    assunto: 'Falta 1 minuto para começar no Precificaí',
    previa: 'Conte o nome do seu negócio e o app já abre pronto para você.',
    selo: 'Passo 1 de 4',
    titulo: 'Falta só 1 minuto para começar',
    paragrafos: [
      'Você criou sua conta no Precificaí, mas ainda não contou o nome do seu negócio.',
      'Informe o nome e o segmento. Com isso, o app já abre com os ingredientes mais comuns do seu ramo, prontos para você colocar o preço que paga.',
    ],
    cta: 'Continuar de onde parei',
    passo: 0,
    video: CAP.primeiroAcesso,
  },
  sem_ingrediente: {
    assunto: 'Seu primeiro preço começa com 1 ingrediente',
    previa: 'Cadastre do jeito que você compra: "Comprei 5 kg por R$ 25".',
    selo: 'Passo 2 de 4',
    titulo: 'Seu primeiro preço começa com 1 ingrediente',
    paragrafos: ['Cadastre do jeito que você compra, sem fazer conta nenhuma:'],
    exemplo: {
      frase: 'Comprei <b>5 kg</b> de farinha por <b>R$ 25,00</b>',
      resultado: 'O Precificaí calcula sozinho: R$ 5,00 o kg, ou R$ 0,50 a cada 100 g.',
    },
    dica: 'Depois, repita com os outros ingredientes da receita. O custo do produto sai na hora.',
    cta: 'Cadastrar meu primeiro ingrediente',
    passo: 1,
    video: CAP.ingrediente,
  },
  kit_sem_preco: {
    assunto: 'Seus ingredientes estão sem preço',
    previa: 'Coloque o preço de 3 ou 4 ingredientes e o preço sugerido aparece.',
    selo: 'Passo 2 de 4',
    titulo: 'Seus ingredientes já estão lá. Falta o preço.',
    paragrafos: [
      'O Kit de Início trouxe os ingredientes do seu segmento, mas sem preço, porque cada fornecedor cobra um valor.',
    ],
    dica: 'Comece pelo produto que você mais vende: coloque o preço que você paga em 3 ou 4 ingredientes dele e o preço sugerido já aparece.',
    cta: 'Colocar meus preços',
    passo: 1,
    video: CAP.ingrediente,
  },
  sem_produto: {
    assunto: 'Falta pouco: monte seu primeiro produto',
    previa: 'Seus ingredientes já têm preço. Veja o custo e o preço sugerido na hora.',
    selo: 'Passo 3 de 4',
    titulo: 'Agora monte seu primeiro produto',
    paragrafos: [
      'Seus ingredientes já têm preço. Escolha os que vão na receita, diga quanto ela rende e veja na hora o custo e o preço sugerido.',
    ],
    dica: 'Não sabe quanto cobrar? Salve sem digitar o preço: o Precificaí usa o sugerido.',
    cta: 'Montar meu produto',
    passo: 2,
    video: CAP.produto,
  },
  produto_sem_preco: {
    assunto: 'Seu produto ainda está sem preço',
    previa: 'Um toque em "Usar sugerido" e o preço certo aparece.',
    selo: 'Passo 4 de 4',
    titulo: 'Seu produto está quase pronto',
    paragrafos: [
      'Você já montou seu produto. Falta só o preço de venda.',
      'Abra o produto e toque em <b>Usar sugerido</b>. Pronto: o preço certo, calculado com o seu custo.',
    ],
    dica: 'O sugerido aparece zerado? É sinal de que os ingredientes ainda estão sem o preço que você paga. Coloque o preço em alguns deles e ele aparece.',
    cta: 'Ver meus produtos',
    passo: 3,
    video: CAP.produto,
  },
  ativo: {
    assunto: 'Seu primeiro preço está pronto. E agora?',
    previa: 'Três passos para deixar o seu preço ainda mais certo.',
    selo: 'Primeiro preço feito',
    titulo: 'Seu primeiro preço está pronto. E agora?',
    paragrafos: ['Você já tem um produto com o preço calculado. Três passos deixam esse preço ainda mais certo:'],
    lista: [
      'Informe os custos do mês no <b>Financeiro</b>: aluguel, luz, salários.',
      'Cadastre os produtos que você <b>mais vende</b>.',
      'Veja no <b>Delivery</b> quanto cobrar no iFood sem perder lucro.',
    ],
    numerada: true,
    cta: 'Abrir o Precificaí',
    passo: 4,
    video: CAP.proximos,
  },
};

const PRO: Bloco = {
  assunto: 'Quanto cobrar no iFood? O Pro calcula para você',
  previa: 'Produtos ilimitados, preço por aplicativo e fichas em PDF.',
  selo: 'Plano Pro',
  titulo: 'Quanto cobrar no iFood sem perder lucro?',
  paragrafos: ['Você já está precificando. No Pro, o Precificaí calcula também o preço de cada aplicativo e libera tudo:'],
  lista: [
    'Produtos e combos <b>ilimitados</b> (no Grátis são 5 de cada).',
    '<b>Delivery</b> com o preço certo para cada aplicativo, já com a comissão de cada um.',
    '<b>Lista de Compras</b>, <b>Relatórios</b> e fichas técnicas em PDF.',
  ],
  preco: true,
  dica: 'Antes de assinar, abra as telas do Pro: elas já aparecem com os seus dados.',
  cta: 'Ver o Pro com os meus dados',
};

const NOVIDADES = [
  'Cadastro de ingrediente em uma frase: <b>"Comprei 5 kg por R$ 25"</b>.',
  '<b>Financeiro em 2 perguntas</b>: quanto você quer ganhar e quanto vende por mês.',
  '<b>Preço sugerido com um toque</b>, sem precisar digitar.',
  'Um <b>vídeo de 5 minutos</b> do primeiro acesso ao primeiro preço.',
];

interface Pedido { campanha: string; estagio: Estagio; plano: string; negocio?: string | null; linkSair: string }

/** Devolve null quando a pessoa não deve receber esta campanha nesta etapa. */
export function montarEmail(p: Pedido): { assunto: string; html: string; texto: string } | null {
  const pago = p.plano !== 'free';
  let bloco: Bloco = ETAPAS[p.estagio] ?? ETAPAS.sem_perfil;
  let assunto = bloco.assunto;
  let previa = bloco.previa;
  let selo = bloco.selo;
  let titulo = bloco.titulo;
  let intro: string | null = null;
  let novidades: string[] | null = null;
  let video: Capitulo | undefined = bloco.video;

  if (p.campanha === 'd3') {
    if (p.estagio === 'ativo') {
      if (pago) return null; // já assina: nada a vender no 3º dia
      bloco = PRO;
      ({ assunto, previa, selo, titulo } = PRO);
      video = undefined;
    } else {
      assunto = 'Faltou pouco para o seu primeiro preço';
      selo = `Faltou pouco · ${bloco.selo}`;
      intro = 'Faltou pouco para o seu primeiro preço. Dá para terminar em poucos minutos.';
    }
  } else if (p.campanha !== 'd1') {
    assunto = 'O Precificaí ficou mais fácil (e tem vídeo de 5 minutos)';
    previa = 'Ingrediente em uma frase, Financeiro em 2 perguntas e preço sugerido com um toque.';
    selo = 'Novidades';
    titulo = 'O Precificaí ficou mais fácil';
    intro = 'Muita coisa mudou desde que você criou sua conta. Veja o que tem de novo:';
    novidades = NOVIDADES;
    video = CAP.abertura;
  }

  const utm = `utm_source=email&utm_medium=email&utm_campaign=${encodeURIComponent(p.campanha)}`;
  const link = `${APP}?${utm}`;
  const nome = (p.negocio || '').trim();
  const ola = nome ? `Olá, ${esc(nome)}!` : 'Olá!';

  // Na campanha, a etapa vira a seção "Seu próximo passo" abaixo das novidades.
  const conteudoEtapa = [
    bloco.passo !== undefined ? htmlJornada(bloco.passo) : '',
    ...bloco.paragrafos.map((t) => par(t)),
    bloco.exemplo ? htmlExemplo(bloco.exemplo) : '',
    bloco.lista ? htmlLista(bloco.lista, !!bloco.numerada) : '',
    bloco.preco ? htmlPreco() : '',
    bloco.dica ? htmlDica(bloco.dica) : '',
  ].join('');

  const corpo = novidades
    ? [
      par(ola),
      par(intro!),
      htmlLista(novidades, false),
      `<div style="height:1px;line-height:1px;font-size:1px;background-color:${COR.borda};margin:8px 0 28px 0;">&nbsp;</div>`,
      `<div style="font-family:${FONTE};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${COR.menta};margin-bottom:6px;">Seu próximo passo</div>`,
      `<h2 style="margin:0 0 18px 0;font-family:${FONTE};font-size:21px;line-height:28px;font-weight:700;color:${COR.texto};">${esc(bloco.titulo)}</h2>`,
      conteudoEtapa,
    ].join('')
    : [par(ola), intro ? par(intro) : '', conteudoEtapa].join('');

  const videoHtml = video
    ? `<tr><td class="px" style="padding:8px 40px 36px 40px;">
      <div style="font-family:${FONTE};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${COR.suave};margin-bottom:10px;">Prefere ver antes?</div>
      <a href="${urlVideo(video)}" style="text-decoration:none;display:block;">
        <img src="${IMG}/video-tutorial.jpg" width="520" alt="Vídeo: seu 1º produto com o preço certo (5 min)" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:12px;">
      </a>
      <p style="margin:12px 0 0 0;font-family:${FONTE};font-size:14px;line-height:21px;color:${COR.suave};">${
        video.t > 0
          ? `Vídeo de 5 minutos. O trecho <a href="${urlVideo(video)}" style="color:${COR.verde};font-weight:600;">${esc(video.titulo)}</a> começa em ${tempo(video.t)}.`
          : `<a href="${urlVideo(video)}" style="color:${COR.verde};font-weight:600;">${esc(video.titulo)}</a>, em 5 minutos.`
      }</p>
    </td></tr>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(assunto)}</title>
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
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(previa)}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${COR.fundo};">
<tr><td align="center" style="padding:32px 12px 40px 12px;">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">

    <tr><td style="background-color:${COR.verde};border-radius:20px 20px 0 0;" class="px" bgcolor="${COR.verde}">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td class="px" style="padding:32px 40px 36px 40px;">
        <a href="${link}" style="text-decoration:none;"><img src="${IMG}/logo-email-branca.png" width="132" height="23" alt="Precificaí" style="display:block;width:132px;height:auto;border:0;color:#ffffff;font-family:${FONTE};font-size:20px;font-weight:700;"></a>
        <div style="height:32px;line-height:32px;font-size:1px;">&nbsp;</div>
        <div style="font-family:${FONTE};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${COR.amarelo};margin-bottom:10px;">${esc(selo)}</div>
        <h1 class="titulo" style="margin:0;font-family:${FONTE};font-size:30px;line-height:38px;font-weight:700;color:#ffffff;">${esc(titulo)}</h1>
      </td></tr></table>
    </td></tr>

    <tr><td style="background-color:#ffffff;" bgcolor="#ffffff">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr><td class="px" style="padding:36px 40px 4px 40px;">${corpo}</td></tr>
        <tr><td class="px botao" style="padding:4px 40px 32px 40px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="${COR.verde}" style="background-color:${COR.verde};border-radius:12px;">
            <a href="${link}" style="display:inline-block;padding:16px 32px;font-family:${FONTE};font-size:17px;line-height:22px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${esc(bloco.cta)}&nbsp;&rarr;</a>
          </td></tr></table>
        </td></tr>
        ${videoHtml}
        <tr><td class="px" style="padding:0 40px 36px 40px;">
          <div style="height:1px;line-height:1px;font-size:1px;background-color:${COR.borda};margin:0 0 24px 0;">&nbsp;</div>
          ${par('Ficou alguma dúvida? Responda este e-mail que a gente ajuda.', 'margin:0 0 4px 0;font-size:15px;line-height:23px;')}
          ${par(`Um abraço,<br><b style="color:${COR.texto};">Equipe Precificaí</b>`, 'margin:0;font-size:15px;line-height:23px;')}
        </td></tr>
      </table>
    </td></tr>

    <tr><td height="6" style="height:6px;line-height:6px;font-size:1px;background-color:${COR.menta};border-radius:0 0 20px 20px;" bgcolor="${COR.menta}">&nbsp;</td></tr>

    <tr><td align="center" class="px" style="padding:28px 40px 0 40px;">
      <img src="${IMG}/logo-email-verde.png" width="96" height="17" alt="Precificaí" style="display:block;width:96px;height:auto;border:0;margin:0 auto 14px auto;">
      <p style="margin:0 0 8px 0;font-family:${FONTE};font-size:12px;line-height:19px;color:${COR.suave};">Você recebe este e-mail porque criou uma conta no Precificaí.<br><a href="${p.linkSair}" style="color:${COR.suave};text-decoration:underline;">Não quero mais receber dicas</a></p>
      <p style="margin:0;font-family:${FONTE};font-size:11px;line-height:17px;color:#9aa8a6;">APLICAI CONSULTORIA E TREINAMENTO LTDA &middot; CNPJ 53.054.196/0001-63<br>Juiz de Fora, MG</p>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`.replace(/R\$ (?=\d)/g, () => 'R$&nbsp;'); // "R$" nunca fica sozinho no fim da linha (função: na string, "$&" seria o trecho encontrado)

  const texto = [
    ola,
    intro ?? '',
    novidades ? novidades.map((n) => `- ${semTags(n)}`).join('\n') : '',
    novidades ? `Seu próximo passo: ${bloco.titulo}` : titulo,
    ...bloco.paragrafos.map(semTags),
    bloco.exemplo ? `Você escreve: ${semTags(bloco.exemplo.frase)}\n${bloco.exemplo.resultado}` : '',
    bloco.lista ? bloco.lista.map((n, i) => `${bloco.numerada ? `${i + 1}.` : '-'} ${semTags(n)}`).join('\n') : '',
    bloco.preco ? 'R$ 29,90 por mês no cartão, ou R$ 322,90 por ano no Pix.' : '',
    bloco.dica ? semTags(bloco.dica) : '',
    `${bloco.cta}: ${link}`,
    video ? `Prefere ver antes? Vídeo de 5 minutos: ${urlVideo(video)}` : '',
    'Ficou alguma dúvida? Responda este e-mail que a gente ajuda.\n\nUm abraço,\nEquipe Precificaí',
    '',
    `Não quer mais receber dicas? ${p.linkSair}`,
    'APLICAI CONSULTORIA E TREINAMENTO LTDA · CNPJ 53.054.196/0001-63',
  ].filter(Boolean).join('\n\n');

  return { assunto, html, texto };
}
