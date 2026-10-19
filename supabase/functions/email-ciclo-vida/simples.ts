// Versão "de pessoa" do d1/d3 (teste A/B iniciado em 19/10/2026).
// O layout da marca caía na aba Promoções do Gmail. Esta versão é quase só texto:
// sem imagens, sem cabeçalho colorido, 1 link, assinada pelo Erick e enviada de
// contato@ (respostas chegam na caixa dele). Metade das pessoas recebe esta, metade a
// atual (ver `versaoAB`), e o acompanhamento compara pelo campo `formato` = 'simples' | 'design'.

import { APP, esc } from './layout.ts';
import type { Estagio } from './layout.ts';

export const FROM_SIMPLES = 'Erick, do Precificaí <contato@precificaiapp.com>';

/** Mesma pessoa, mesma versão no d1 e no d3: pelo último caractere do id (hex). */
export function versaoAB(userId: string): 'simples' | 'design' {
  return parseInt(userId.slice(-1), 16) % 2 === 1 ? 'simples' : 'design';
}

interface Texto { assunto: string; paragrafos: string[]; cta: string }

const D1: Record<Estagio, Texto> = {
  sem_perfil: {
    assunto: 'Falta 1 minuto para começar',
    paragrafos: [
      'Vi que você criou sua conta no Precificaí, mas ainda não contou o nome do seu negócio.',
      'Leva 1 minuto. Com isso, o app já abre com os ingredientes mais comuns do seu ramo, e você só coloca o preço que paga.',
    ],
    cta: 'Continuar de onde parei',
  },
  sem_ingrediente: {
    assunto: 'Seu primeiro preço começa com 1 ingrediente',
    paragrafos: [
      'Para o Precificaí calcular o seu preço, comece por um ingrediente. Escreva do jeito que você compra, por exemplo: "Comprei 5 kg de farinha por R$ 25,00".',
      'O app faz a conta sozinho: R$ 5,00 o quilo, ou R$ 0,50 a cada 100 g.',
    ],
    cta: 'Cadastrar meu primeiro ingrediente',
  },
  kit_sem_preco: {
    assunto: 'Seus ingredientes estão sem preço',
    paragrafos: [
      'O Kit de Início trouxe os ingredientes do seu ramo, mas sem preço, porque cada fornecedor cobra um valor.',
      'Uma dica: escolha o produto que você mais vende e coloque o preço que você paga em 3 ou 4 ingredientes dele. O preço sugerido já aparece.',
    ],
    cta: 'Colocar meus preços',
  },
  sem_produto: {
    assunto: 'Falta pouco: monte seu primeiro produto',
    paragrafos: [
      'Seus ingredientes já têm preço. Agora escolha os que vão na receita e diga quanto ela rende.',
      'O custo e o preço sugerido aparecem na hora. Se não souber quanto cobrar, salve sem preço: o app usa o sugerido.',
    ],
    cta: 'Montar meu produto',
  },
  produto_sem_preco: {
    assunto: 'Seu produto ainda está sem preço',
    paragrafos: [
      'Você já montou seu produto. Falta só o preço de venda.',
      'Abra o produto e toque em "Usar sugerido". O preço sai calculado com o seu custo. Se o sugerido aparecer zerado, coloque o preço que você paga em alguns ingredientes.',
    ],
    cta: 'Ver meus produtos',
  },
  ativo: {
    assunto: 'Seu primeiro preço está pronto. E agora?',
    paragrafos: [
      'Parabéns, você já tem um produto com o preço calculado.',
      'O próximo passo que mais muda o resultado é o Financeiro: conte quanto quer ganhar e quanto vende por mês, e o preço sugerido passa a cobrir também o aluguel, a luz e o seu salário.',
    ],
    cta: 'Abrir o Financeiro',
  },
};

const PRO: Texto = {
  assunto: 'Quanto cobrar no iFood sem perder lucro?',
  paragrafos: [
    'Você já está precificando, e isso já coloca você na frente de muita gente.',
    'Se você vende por aplicativo, o Pro calcula o preço certo de cada um, já com a comissão. Ele também libera produtos ilimitados (no Grátis são 5), a lista de compras e as fichas em PDF. Custa R$ 29,90 por mês, ou R$ 322,90 por ano no Pix.',
    'Antes de assinar, dá para abrir as telas do Pro e ver tudo com os seus dados.',
  ],
  cta: 'Ver o Pro com os meus dados',
};

/** null = esta pessoa não recebe esta campanha (mesma regra do layout atual). */
export function montarSimples(p: { campanha: string; estagio: Estagio; plano: string; negocio?: string | null; linkSair: string }):
  { assunto: string; html: string; texto: string } | null {
  const pago = p.plano !== 'free';
  let t = D1[p.estagio] ?? D1.sem_perfil;
  let abertura = 'Aqui é o Erick, do Precificaí.';
  if (p.campanha === 'd3') {
    if (p.estagio === 'ativo') {
      if (pago) return null;
      t = PRO;
    } else {
      t = { ...t, assunto: 'Faltou pouco para o seu primeiro preço' };
      abertura = 'Aqui é o Erick, do Precificaí. Passando para lembrar de onde você parou.';
    }
  }
  const link = `${APP}?utm_source=email&utm_medium=email&utm_campaign=${encodeURIComponent(p.campanha)}&utm_content=simples`;
  const nome = (p.negocio || '').trim();
  const oi = nome ? `Oi, ${nome}!` : 'Oi!';
  const linhas = [oi, abertura, ...t.paragrafos];
  const fecho = 'Se travou em alguma coisa, é só responder este e-mail. Eu leio todos.';

  const p_ = (s: string) => `<p style="margin:0 0 14px 0;">${s}</p>`;
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(t.assunto)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:560px;padding:20px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222222;">
${linhas.map((l) => p_(esc(l))).join('\n')}
${p_(`<a href="${link}" style="color:#004d47;font-weight:bold;">${esc(t.cta)}</a>`)}
${p_(esc(fecho))}
${p_('Um abraço,<br>Erick<br>Precificaí')}
<p style="margin:28px 0 0 0;font-size:12px;line-height:1.5;color:#888888;">Você recebe esta mensagem porque criou uma conta no Precificaí. <a href="${p.linkSair}" style="color:#888888;">Não quero mais receber</a>.</p>
</div>
</body></html>`.replace(/R\$ (?=\d)/g, () => 'R$&nbsp;');

  const texto = [...linhas, `${t.cta}: ${link}`, fecho, 'Um abraço,\nErick\nPrecificaí', `Não quer mais receber? ${p.linkSair}`].join('\n\n');
  return { assunto: t.assunto, html, texto };
}
