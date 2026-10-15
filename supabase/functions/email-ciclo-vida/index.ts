// email-ciclo-vida — e-mails de 1 e 3 dias após o cadastro, campanhas avulsas
// (reativação) e descadastro.
//
// Quem recebe e em que etapa a pessoa parou vêm do banco
// (public.email_candidatos / public.email_estagio, migration 20261014200000).
// Cada e-mail fala da etapa em que a pessoa travou: perfil vazio, nenhum
// ingrediente, kit com preço zerado, produto sem preço…
//
// Chamadas (POST, header x-cron-secret = EMAIL_CRON_SECRET):
//   { automatico: true }                         → d1 + d3 (o pg_cron chama de hora em hora;
//                                                   só envia entre 8h e 20h de Brasília)
//   { campanha: 'reativacao-2026-10' }           → simulação: lista quem receberia (não envia)
//   { campanha: '…', enviar: true, limite: 50 }  → envia de verdade
//   + desde / ate (ISO, opcionais)               → quem se cadastrou no período, em vez da janela da campanha
//   { teste: { para, campanha, estagio, plano, negocio } } → uma amostra para `para`, sem registrar
// Descadastro (público): GET/POST ?sair=<uid>.<assinatura>  (link do rodapé e List-Unsubscribe)
//
// Secrets: RESEND_API_KEY, EMAIL_CRON_SECRET, EMAIL_OPTOUT_SECRET (+ SUPABASE_URL / SERVICE_ROLE do runtime).

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP = 'https://app.precificaiapp.com/';
const VIDEO = 'https://youtu.be/qG2BFhvEFkU';
const FROM = 'Precificaí <noreply@precificaiapp.com>';
const REPLY_TO = 'contato@precificaiapp.com';
const FUNC_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/email-ciclo-vida`;

type Estagio = 'sem_perfil' | 'sem_ingrediente' | 'kit_sem_preco' | 'sem_produto' | 'produto_sem_preco' | 'ativo';

// Imagens servidas pela landing (precificai-site/assets/email/).
const IMG = 'https://precificaiapp.com/assets/email';

// Capítulos do vídeo "Primeiros passos" (mesmos de src/config/tutorial.js).
const CAP = {
  abertura: { t: 0, titulo: 'Do primeiro acesso ao primeiro preço' },
  primeiroAcesso: { t: 17, titulo: 'Primeiro acesso e Kit de Início' },
  ingrediente: { t: 173, titulo: 'Cadastrando o primeiro ingrediente' },
  produto: { t: 211, titulo: 'Montando o produto e vendo o preço sugerido' },
  proximos: { t: 265, titulo: 'Próximos passos' },
};
type Capitulo = (typeof CAP)[keyof typeof CAP];

// Jornada até o primeiro preço. `passo` = quantos já foram feitos.
const JORNADA = ['Seu negócio', 'Ingredientes', 'Produto', 'Preço'];

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

// ---------- montagem do e-mail ----------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Textos de ETAPAS/PRO/NOVIDADES são nossos e podem ter <b>; no texto puro, sai a marcação. */
function semTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

function tempo(seg: number): string {
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
}

function urlVideo(c: Capitulo): string {
  return `${VIDEO}${c.t > 0 ? `?t=${c.t}` : ''}`;
}

const FONTE = "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const COR = {
  verde: '#004d47', verdeEscuro: '#003833', menta: '#00c9a7', amarelo: '#e3b842', amareloClaro: '#fff4d6',
  fundo: '#f4f6f5', texto: '#1a1a2e', corpo: '#3d4a48', suave: '#6b7d7b', borda: '#d8e0de', verdeClaro: '#e8f3f2',
};

const par = (t: string, extra = '') =>
  `<p style="margin:0 0 16px 0;font-family:${FONTE};font-size:16px;line-height:26px;color:${COR.corpo};${extra}">${t}</p>`;

function htmlLista(itens: string[], numerada: boolean): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 20px 0;">${itens
    .map((item, i) => `<tr>
      <td width="36" valign="top" style="padding:0 0 12px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="26" height="26" align="center" valign="middle" style="width:26px;height:26px;border-radius:13px;background-color:${numerada ? COR.verde : COR.verdeClaro};font-family:${FONTE};font-size:13px;font-weight:700;line-height:26px;color:${numerada ? '#ffffff' : COR.verde};">${numerada ? i + 1 : '&#10003;'}</td></tr></table>
      </td>
      <td valign="top" style="padding:1px 0 12px 0;font-family:${FONTE};font-size:16px;line-height:24px;color:${COR.corpo};">${item}</td>
    </tr>`).join('')}</table>`;
}

function htmlJornada(passo: number): string {
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

function htmlExemplo(e: { frase: string; resultado: string }): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px 0;border:1px solid ${COR.borda};border-radius:12px;"><tr><td style="padding:18px 20px;">
    <div style="font-family:${FONTE};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COR.suave};margin-bottom:8px;">Você escreve</div>
    <div style="font-family:${FONTE};font-size:20px;line-height:28px;color:${COR.texto};">${e.frase}</div>
    <div style="height:1px;line-height:1px;font-size:1px;background-color:${COR.borda};margin:14px 0;">&nbsp;</div>
    <div style="font-family:${FONTE};font-size:15px;line-height:22px;color:${COR.verde};font-weight:600;">${e.resultado}</div>
  </td></tr></table>`;
}

function htmlDica(t: string): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;"><tr>
    <td width="4" style="width:4px;background-color:${COR.amarelo};border-radius:2px;">&nbsp;</td>
    <td style="padding:14px 18px;background-color:${COR.amareloClaro};border-radius:0 10px 10px 0;font-family:${FONTE};font-size:15px;line-height:23px;color:${COR.verdeEscuro};">${t}</td>
  </tr></table>`;
}

function htmlPreco(): string {
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

// ---------- descadastro ----------

async function hmac(segredo: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function linkSair(uid: string): Promise<string> {
  const sig = await hmac(Deno.env.get('EMAIL_OPTOUT_SECRET') || '', uid);
  return `${FUNC_URL}?sair=${uid}.${sig}`;
}

function pagina(titulo: string, texto: string, status = 200): Response {
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titulo)}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f5;margin:0;padding:40px 16px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;text-align:center;">
<h1 style="color:#004D47;font-size:22px;margin:0 0 12px;">${esc(titulo)}</h1><p style="color:#4a4a4a;font-size:15px;line-height:1.5;margin:0;">${esc(texto)}</p>
<p style="margin:20px 0 0;"><a href="${APP}" style="color:#004D47;">Abrir o Precificaí</a></p></div></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ---------- envio ----------

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function enviarResend(para: string, email: { assunto: string; html: string; texto: string }, sair: string, campanha: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [para],
      reply_to: REPLY_TO,
      subject: email.assunto,
      html: email.html,
      text: email.texto,
      headers: { 'List-Unsubscribe': `<${sair}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      tags: [{ name: 'campanha', value: campanha.replace(/[^a-zA-Z0-9_-]/g, '_') }],
    }),
  });
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(corpo).slice(0, 200)}`);
  return corpo?.id as string | undefined;
}

function horaBrasilia(): number {
  return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()));
}

serve(async (req) => {
  const url = new URL(req.url);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Descadastro: público, protegido pela assinatura do link.
  const sair = url.searchParams.get('sair');
  if (sair) {
    const [uid, sig] = sair.split('.');
    const ok = uid && sig && /^[0-9a-f-]{36}$/i.test(uid) && sig === (await hmac(Deno.env.get('EMAIL_OPTOUT_SECRET') || '', uid));
    if (!ok) return pagina('Link inválido', 'Não conseguimos confirmar este link. Escreva para contato@precificaiapp.com que tiramos você da lista.', 400);
    const { error } = await supabase.from('email_optout').upsert({ user_id: uid }, { onConflict: 'user_id' });
    if (error) return pagina('Algo deu errado', 'Tente de novo em instantes ou escreva para contato@precificaiapp.com.', 500);
    return pagina('Pronto', 'Você não vai mais receber nossos e-mails de dicas e novidades. Os e-mails sobre a sua conta continuam.');
  }

  if (req.method !== 'POST') return new Response('Not found', { status: 404 });
  if (req.headers.get('x-cron-secret') !== Deno.env.get('EMAIL_CRON_SECRET')) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // Amostra para conferir o visual, sem registrar envio.
  if (body?.teste?.para) {
    const t = body.teste;
    const email = montarEmail({
      campanha: t.campanha || 'd1', estagio: t.estagio || 'sem_ingrediente', plano: t.plano || 'free',
      negocio: t.negocio || null, linkSair: `${APP}#exemplo-descadastro`,
    });
    if (!email) return new Response(JSON.stringify({ ok: true, enviado: false, motivo: 'combinação sem e-mail' }));
    const id = await enviarResend(t.para, { ...email, assunto: `[Teste] ${email.assunto}` }, `${APP}#exemplo-descadastro`, 'teste');
    return new Response(JSON.stringify({ ok: true, enviado: true, id, assunto: email.assunto }));
  }

  const automatico = body?.automatico === true;
  if (automatico) {
    const h = horaBrasilia();
    if (h < 8 || h >= 20) return new Response(JSON.stringify({ ok: true, pulado: 'fora do horário', hora: h }));
  }
  const campanhas: string[] = automatico ? ['d1', 'd3'] : [String(body?.campanha || '')].filter(Boolean);
  if (!campanhas.length) return new Response(JSON.stringify({ ok: false, error: 'campanha ausente' }), { status: 400 });
  const enviar = automatico || body?.enviar === true;
  const limite = Math.max(1, Math.min(Number(body?.limite) || 60, 200));

  const relatorio: Record<string, unknown>[] = [];
  for (const campanha of campanhas) {
    // `desde` / `ate` (ISO): troca a janela da campanha pelo período de cadastro.
    const periodo = automatico ? {} : {
      ...(body?.desde ? { p_desde: String(body.desde) } : {}),
      ...(body?.ate ? { p_ate: String(body.ate) } : {}),
    };
    const { data: candidatos, error } = await supabase.rpc('email_candidatos', { p_campanha: campanha, ...periodo });
    if (error) {
      relatorio.push({ campanha, erro: error.message });
      continue;
    }
    for (const c of (candidatos || []).slice(0, limite)) {
      const sairLink = await linkSair(c.user_id);
      const email = montarEmail({ campanha, estagio: c.estagio, plano: c.plano, negocio: c.negocio, linkSair: sairLink });
      if (!email) { relatorio.push({ campanha, email: c.email, estagio: c.estagio, pulado: 'nada a enviar' }); continue; }
      if (!enviar) { relatorio.push({ campanha, email: c.email, estagio: c.estagio, plano: c.plano, assunto: email.assunto }); continue; }

      // Reserva antes de enviar: a unique (user_id, campanha) impede envio duplo
      // se duas execuções se cruzarem. Falhou o envio → libera a reserva.
      const { data: reserva, error: errReserva } = await supabase
        .from('email_envios')
        .insert({ user_id: c.user_id, campanha, estagio: c.estagio })
        .select('id')
        .maybeSingle();
      if (errReserva || !reserva) { relatorio.push({ campanha, email: c.email, pulado: 'já enviado' }); continue; }
      try {
        const id = await enviarResend(c.email, email, sairLink, campanha);
        await supabase.from('email_envios').update({ resend_id: id ?? null }).eq('id', reserva.id);
        relatorio.push({ campanha, email: c.email, estagio: c.estagio, enviado: true });
      } catch (e) {
        await supabase.from('email_envios').delete().eq('id', reserva.id);
        relatorio.push({ campanha, email: c.email, erro: String(e).slice(0, 200) });
      }
      await espera(600); // Resend: 2 envios por segundo
    }
  }
  return new Response(JSON.stringify({ ok: true, enviar, relatorio }), { headers: { 'Content-Type': 'application/json' } });
});
