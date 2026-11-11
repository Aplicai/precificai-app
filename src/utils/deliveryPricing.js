/**
 * Sprint 2 S3 — Módulo único e canônico de precificação delivery.
 *
 * MOTIVAÇÃO (audit P0-03):
 * Existiam 3 fórmulas divergentes espalhadas pelo app:
 *   - DeliveryPrecosScreen.calcDeliveryPrice    → só taxa_plataforma (P / (1-taxa))
 *   - ComparativoCanaisScreen.calcPrecoDelivery → mesma fórmula + abatia comissao_app como R$ (errado: comissao_app é %)
 *   - DeliveryHubScreen.simularPreco            → fórmula completa (desconto → cupom → comissão sobre base+frete → frete)
 *
 * Resultado: o mesmo produto mostrava 3 preços sugeridos diferentes em telas diferentes.
 * Sintoma reportado: lojista colocava R$ 25 no produto, via "lucro positivo" em uma tela e "prejuízo" na outra.
 *
 * REGRA DE NEGÓCIO (única, agora canônica):
 * Para um pedido de delivery, o restaurante cobra `precoVenda`. Os abatimentos vêm em ordem:
 *   1. Desconto promocional (% sobre o preço cheio): `preco × (1 - descontoPct)`
 *   2. Cupom de desconto (R$ fixo, abatido após o %): `precoComDesconto - cupomR$`
 *   3. Comissão da plataforma (% sobre [preço-após-cupom + taxa de entrega cobrada do cliente]):
 *      `(precoAposCupom + taxaEntrega) × comissaoPct`
 *   4. Receita líquida = `precoAposCupom - comissão - taxaEntrega`
 *   5. Lucro = receita líquida - custoUnitário
 *   6. Margem = lucro / precoVenda
 *
 * INVERSÃO (preço sugerido para atingir margem alvo):
 *   lucro = receitaLiq - custo = preco × margemAlvo
 *   ⟹  preco × ((1-d)(1-com) - margemAlvo) = cupom×(1-com) + frete + custo
 *   ⟹  preco = (cupom×(1-com) + frete + custo) / ((1-d)(1-com) - margemAlvo)
 *
 * Se o divisor ≤ 0 → INVIÁVEL (descontos + comissão + margem alvo ≥ 100% do preço).
 *
 * NOMENCLATURA DAS COLUNAS DA TABELA `delivery_plataformas` (idem `plat.*`):
 *   plat.taxa_plataforma   → comissão % (legacy nome — herdado do schema antigo)
 *   plat.comissao_app      → idem (alias usado em algumas telas)
 *   plat.desconto_promocao → desconto % aplicado em campanha
 *   plat.embalagem_extra   → cupom R$ (legacy nome — historicamente era "embalagem")
 *   plat.taxa_entrega      → frete cobrado do cliente em R$
 */

const DEFAULT_MARGEM_ALVO = 0.30; // 30%

function safeNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function roundUpTo50(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.ceil(value * 2) / 2;
}

/**
 * Normaliza configuração de plataforma para o shape canônico esperado pelas funções.
 * Aceita os múltiplos nomes legacy.
 */
export function normalizePlatform(plat) {
  return {
    nome: plat?.plataforma || plat?.nome || 'Plataforma',
    // Audit (CRÍTICO delivery): semântica CANÔNICA = DeliveryPlataformasScreen /
    // deliveryAdapter — taxa_plataforma = comissão %, comissao_app = taxa de
    // pagamento online %, outros_perc = outras taxas %, desconto_promocao = cupom R$.
    // Somamos os três % (todos são custos reais sobre a venda). `embalagem_extra`
    // era o "Cupom R$" do editor antigo do Hub — mantido como fallback aditivo.
    comissaoPct: (safeNum(plat?.taxa_plataforma) + safeNum(plat?.comissao_app) + safeNum(plat?.outros_perc)) / 100,
    descontoPct: 0,
    cupomR$: safeNum(plat?.desconto_promocao) + safeNum(plat?.embalagem_extra),
    taxaEntregaR$: safeNum(plat?.taxa_entrega),
  };
}

/**
 * Calcula o resultado financeiro de vender `precoVenda` numa plataforma.
 * Retorna sempre um objeto (nunca null) para facilitar consumo em renderização.
 */
export function calcResultadoDelivery({ precoVenda, custoUnit, plat }) {
  const preco = safeNum(precoVenda);
  const custo = safeNum(custoUnit);
  const p = normalizePlatform(plat);

  if (preco <= 0) {
    return {
      preco: 0, custoUnit: custo, ...p,
      valorDesconto: 0, precoComDesconto: 0, precoAposCupom: 0,
      baseComissao: 0, valorComissao: 0,
      receitaLiq: 0, lucro: 0, margem: 0,
      inviavel: true, motivoInviavel: 'Preço de venda zero ou negativo',
    };
  }

  // 1. Desconto %
  const valorDesconto = preco * p.descontoPct;
  const precoComDesconto = preco * (1 - p.descontoPct);
  // 2. Cupom R$
  const precoAposCupom = precoComDesconto - p.cupomR$;
  // 3. Comissão sobre (preço após cupom + frete)
  const baseComissao = precoAposCupom + p.taxaEntregaR$;
  const valorComissao = baseComissao * p.comissaoPct;
  // 4. Receita líquida (o que entra no caixa do restaurante)
  const receitaLiq = precoAposCupom - valorComissao - p.taxaEntregaR$;
  // 5. Lucro e margem
  const lucro = receitaLiq - custo;
  const margem = lucro / preco;

  // Sinaliza inviabilidade se a receita líquida for menor que o custo (loja paga pra trabalhar)
  const inviavel = receitaLiq < 0 || lucro < 0;

  return {
    preco, custoUnit: custo, ...p,
    valorDesconto, precoComDesconto, precoAposCupom,
    baseComissao, valorComissao,
    receitaLiq, lucro, margem,
    inviavel,
    motivoInviavel: inviavel
      ? (receitaLiq < 0 ? 'Descontos + comissão > preço' : 'Lucro negativo (receita líquida < CMV)')
      : null,
  };
}

/**
 * Inverte a fórmula: dado custo, plataforma e margem alvo, retorna o preço
 * mínimo que precisa ser cobrado para atingir essa margem.
 *
 * Retorna `{ precoSugerido: null, inviavel: true, ... }` quando o conjunto de
 * taxas + margem alvo for matematicamente impossível de atingir.
 */
export function sugerirPrecoDelivery({ custoUnit, plat, margemAlvo = DEFAULT_MARGEM_ALVO, arredondar = true }) {
  const custo = safeNum(custoUnit);
  const p = normalizePlatform(plat);
  const m = safeNum(margemAlvo);

  if (custo <= 0) {
    return { precoSugerido: null, precoMinimo: null, inviavel: true, motivoInviavel: 'Custo zero ou negativo' };
  }

  // Audit: o modelo direto (calcResultadoDelivery) cobra comissão sobre
  // (preço após cupom + frete) E abate o frete → o frete pesa frete×(1+comissão).
  // Antes o numerador usava só `frete` e a margem obtida ficava abaixo do alvo.
  const numerador = p.cupomR$ * (1 - p.comissaoPct) + p.taxaEntregaR$ * (1 + p.comissaoPct) + custo;
  const divisorAlvo = (1 - p.descontoPct) * (1 - p.comissaoPct) - m;
  const divisorMin = (1 - p.descontoPct) * (1 - p.comissaoPct);

  const precoSugeridoBruto = (Number.isFinite(divisorAlvo) && divisorAlvo > 0) ? numerador / divisorAlvo : null;
  const precoMinimoBruto = (Number.isFinite(divisorMin) && divisorMin > 0)
    ? (custo + p.cupomR$ * (1 - p.comissaoPct) + p.taxaEntregaR$ * (1 + p.comissaoPct)) / divisorMin
    : null;

  const inviavel = precoSugeridoBruto === null || precoSugeridoBruto <= 0;

  return {
    precoSugerido: arredondar && precoSugeridoBruto ? roundUpTo50(precoSugeridoBruto) : precoSugeridoBruto,
    precoMinimo: arredondar && precoMinimoBruto ? roundUpTo50(precoMinimoBruto) : precoMinimoBruto,
    inviavel,
    motivoInviavel: inviavel
      ? `Descontos (${(p.descontoPct * 100).toFixed(0)}%) + comissão (${(p.comissaoPct * 100).toFixed(0)}%) + margem alvo (${(m * 100).toFixed(0)}%) ultrapassam 100% do preço`
      : null,
  };
}

/**
 * Versão "simples" — mantida apenas para preservar compatibilidade com o card
 * "preço sugerido para cobrir taxa" (que NÃO considera margem, só break-even).
 * Equivale a `sugerirPrecoDelivery({ custoUnit: precoVenda, plat, margemAlvo: 0 })`.
 *
 * @deprecated Prefira `sugerirPrecoDelivery` nas novas telas. Mantido para
 *   minimizar diff em DeliveryPrecosScreen + ComparativoCanaisScreen.
 */
export function calcPrecoBreakEven(precoVenda, plat) {
  const r = sugerirPrecoDelivery({
    custoUnit: precoVenda, // usa o preço atual como "custo" → preço que cobre as taxas
    plat,
    margemAlvo: 0,
    arredondar: true,
  });
  return r.inviavel ? null : r.precoSugerido;
}

// ─────────────────────────────────────────────────────────────────────────
// APP-25/26/27: NOVO MODELO COMPLETO DE PRECIFICAÇÃO DELIVERY
// ─────────────────────────────────────────────────────────────────────────
//
// O modelo legado acima (calcResultadoDelivery, sugerirPrecoDelivery) NÃO
// considera custos fixos do mês nem imposto. A testadora reclamou: "Eu não
// tô diluindo o custo fixo, eu não tô colocando esses 8% lá. O custo do mês
// tem que entrar lá também."
//
// Esta nova função delega ao engine unificado em `precificacao.js` e adiciona
// TODOS os componentes:
//   - Lucro desejado delivery (configurável independente do balcão)
//   - Custos fixos % (mesmo do balcão)
//   - Imposto %
//   - Comissão % (taxa_plataforma)
//   - Taxa pagamento online % (comissao_app, agora interpretado como %)
//   - Cupom recorrente em R$ (desconto_promocao, agora R$)
//   - Frete subsidiado em R$ (taxa_entrega)
//
// Mantém o legado pra não quebrar telas existentes; novas telas devem usar este.

import { calcularPrecoDelivery as _engCalcDelivery, compararDeliveryVsBalcao as _engCompara } from './precificacao';
import { formatPercentBR } from './calculations';

/**
 * Preço sugerido delivery completo (APP-25).
 *
 * @param {object} params
 * @param {number} params.cmv          - CMV em R$ (insumos + embalagem)
 * @param {object} params.plat         - row delivery_config
 * @param {object} params.contexto     - financeiro: { lucroPerc, fixoPerc, impostoPerc } em decimal
 * @returns {object} resultado completo do engine
 */
export function calcSugestaoDeliveryCompleta({ cmv, plat, contexto }) {
  const safe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  // Sessão 28.14 + 28.23 — BUG FIX dupla:
  // 1. cupomR (28.14): de desconto_promocao % pra embalagem_extra R$ (alinhar com normalizePlatform)
  // 2. comissão (28.23): UI de plataforma escreve "Comissão" em `comissao_app` (legacy nome).
  //    Engine antes usava só `taxa_plataforma` → mostrava 0%. Agora usa o fallback igual normalizePlatform.
  // Audit: semântica canônica (ver normalizePlatform) — comissão = taxa_plataforma;
  // taxa de pagamento online = comissao_app; cupom R$ = desconto_promocao.
  const impostoComDesconto = safe(contexto?.impostoPerc);
  const comissaoPerc = safe(plat?.taxa_plataforma) / 100;
  const taxaOnlinePerc = safe(plat?.comissao_app) / 100;
  // Sessão 28.27: novo campo "Outros %" pra taxas embutidas (marketing, fundo
  // de propaganda, etc) que o user contrata com a plataforma. Soma como mais
  // um custo variável.
  const outrosPerc = safe(plat?.outros_perc) / 100;
  return _engCalcDelivery({
    cmv,
    lucroPerc: safe(contexto?.lucroPerc),
    fixoPerc: safe(contexto?.fixoPerc),
    impostoPerc: impostoComDesconto,
    comissaoPerc,
    // Sessão 28.23: taxaPagamentoOnline desativada (não tem campo dedicado no schema atual,
    // o `comissao_app` virou o campo de "Comissão" na UI). Deixa em 0 pra não dobrar.
    // Sessão 28.27: usamos esse slot pra "outros %" — engine só somava esse campo
    // como variável, mesmo efeito final. Mantém compatibilidade pra simulações antigas
    // (onde outros_perc não existe → fallback 0).
    taxaPagamentoOnlinePerc: taxaOnlinePerc + outrosPerc,
    cupomR: safe(plat?.desconto_promocao) + safe(plat?.embalagem_extra),
    freteSubsidiadoR: safe(plat?.taxa_entrega),
    margemSegurancaPerc: safe(contexto?.margemSegurancaPerc),
  });
}

/**
 * Preço delivery que entrega o MESMO LUCRO LÍQUIDO em R$ por venda que o balcão.
 *
 * MOTIVAÇÃO (Sessão 28.34 — bug reportado pelo usuário):
 * O card/coluna "MESMO LUCRO" antes passava o lucro % do balcão como `lucroPerc`
 * alvo no delivery (via calcSugestaoDeliveryCompleta). Isso preserva a MARGEM %,
 * NÃO o R$. Como o delivery tem custos variáveis diferentes do balcão (entra
 * comissão da plataforma, sai a maquininha), o R$ resultante não batia com o do
 * balcão — o usuário via "Pra ter R$ 1,83 de lucro" mas o preço só rendia R$ 1,39.
 *
 * Aqui invertemos a fórmula para fixar o LUCRO EM R$ (não a margem %):
 *   lucro = preco − cmv − custosAbsolutos − preco×(fixo% + variavel%)
 *   ⟹ preco = (lucroAlvoR$ + cmv + custosAbsolutos) / (1 − fixo% − variavel%)
 *
 * onde variavel% = imposto(+desconto) + comissão + outros (mesma base que o
 * delivery usa em calcSugestaoDeliveryCompleta), garantindo que o preço gerado
 * renda exatamente `lucroAlvoReais` de lucro líquido por venda.
 *
 * @param {object} params
 * @param {number} params.cmv            - CMV em R$ (insumos + embalagem)
 * @param {number} params.lucroAlvoReais - Lucro líquido em R$ que se quer igualar (o do balcão)
 * @param {object} params.plat           - row delivery_config
 * @param {object} params.contexto       - { fixoPerc, impostoPerc } em decimal
 * @returns {{ preco:number, lucroReais:number, divisor:number, inviavel:boolean, validacao:{ok:boolean, nivel:string, mensagem:string} }}
 */
export function calcPrecoMesmoLucroReais({ cmv, lucroAlvoReais, plat, contexto }) {
  const safe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const impostoPerc = safe(contexto?.impostoPerc);
  const comissaoPerc = (safe(plat?.taxa_plataforma) + safe(plat?.comissao_app)) / 100;
  const outrosPerc = safe(plat?.outros_perc) / 100;
  const fixoPerc = safe(contexto?.fixoPerc);
  const cupomR = safe(plat?.desconto_promocao) + safe(plat?.embalagem_extra);
  const freteR = safe(plat?.taxa_entrega);

  const variavelPerc = impostoPerc + comissaoPerc + outrosPerc;
  const custosAbsolutos = cupomR + freteR;
  const divisor = 1 - fixoPerc - variavelPerc;
  const lucroAlvo = safe(lucroAlvoReais);
  const cmvR = safe(cmv);

  if (!(divisor > 0)) {
    return {
      preco: 0,
      lucroReais: 0,
      divisor,
      inviavel: true,
      validacao: {
        ok: false,
        nivel: 'inviavel',
        mensagem: `Custos fixos + variáveis (${formatPercentBR((1 - divisor) * 100, 1)}) já consomem 100% ou mais do preço.`,
      },
    };
  }

  const preco = (lucroAlvo + cmvR + custosAbsolutos) / divisor;
  const inviavel = !(preco > 0);
  return {
    preco,
    lucroReais: lucroAlvo, // por construção, o preço rende exatamente esse R$
    divisor,
    inviavel,
    validacao: { ok: !inviavel, nivel: inviavel ? 'inviavel' : 'ok', mensagem: '' },
  };
}

/**
 * Lucro LÍQUIDO de vender `precoVenda` numa plataforma — a mesma conta da
 * composição de "Simulação no <plataforma>" (SimulacaoProdutoScreen) e a
 * inversa exata de calcPrecoMesmoLucroReais:
 *
 *   lucro = preco − cmv − preco×(fixo% + imposto% + comissão% + online% + outros%) − cupomR$ − freteR$
 *
 * Bug 2026-11-11: "Preços do Delivery" mostrava calcResultadoDelivery (sem
 * custos do mês nem imposto) — hambúrguer a R$ 30 no iFood 27% aparecia com
 * R$ 5,85 de lucro quando dava −R$ 3,45.
 *
 * @param {object} params
 * @param {number} params.precoVenda
 * @param {number} params.cmv        - custo no delivery (CMV + embalagem de delivery)
 * @param {object} params.plat       - row delivery_config
 * @param {object} params.contexto   - { fixoPerc, impostoPerc } em decimal
 */
export function calcLucroDeliveryLiquido({ precoVenda, cmv, plat, contexto }) {
  const safe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const preco = safe(precoVenda);
  const custo = safe(cmv);
  const fixoPerc = safe(contexto?.fixoPerc);
  const impostoPerc = safe(contexto?.impostoPerc);
  const comissaoPerc = (safe(plat?.taxa_plataforma) + safe(plat?.comissao_app) + safe(plat?.outros_perc)) / 100;
  const cupomR = safe(plat?.desconto_promocao) + safe(plat?.embalagem_extra);
  const freteR = safe(plat?.taxa_entrega);

  if (!(preco > 0)) {
    return {
      preco: 0, cmv: custo, fixoPerc, impostoPerc, comissaoPerc, cupomR, freteR,
      valorFixos: 0, valorImposto: 0, valorComissao: 0,
      lucro: 0, margem: 0, inviavel: true,
    };
  }

  const valorFixos = preco * fixoPerc;
  const valorImposto = preco * impostoPerc;
  const valorComissao = preco * comissaoPerc;
  const lucro = preco - custo - valorFixos - valorImposto - valorComissao - cupomR - freteR;
  return {
    preco, cmv: custo, fixoPerc, impostoPerc, comissaoPerc, cupomR, freteR,
    valorFixos, valorImposto, valorComissao,
    lucro, margem: lucro / preco,
    // Inviável = os % sobre o preço já comem 100% dele (nenhum preço resolve).
    // Prejuízo comum (lucro < 0) NÃO é inviável — a tela mostra o valor em vermelho.
    inviavel: fixoPerc + impostoPerc + comissaoPerc >= 1,
  };
}

/**
 * Maior comissão da plataforma (taxa_plataforma, em %) que ainda deixa lucro
 * líquido >= 0 vendendo a `precoVenda` (mesma conta de calcLucroDeliveryLiquido).
 * Usado na dica "Negocie a taxa". null se preço <= 0; 0 se nem com taxa 0 fecha.
 */
export function calcTaxaMaximaPlataforma({ precoVenda, cmv, plat, contexto }) {
  const safe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const preco = safe(precoVenda);
  if (!(preco > 0)) return null;
  const semTaxa = calcLucroDeliveryLiquido({ precoVenda: preco, cmv, plat: { ...plat, taxa_plataforma: 0 }, contexto });
  return Math.max(0, (semTaxa.lucro / preco) * 100);
}

/**
 * Linhas do "Comparativo Canal vs Delivery" (ComparativoCanaisScreen): balcão +
 * cada plataforma, todas em lucro LÍQUIDO.
 *   balcão:   preço − custo − preço×(fixos% + variáveis%)
 *   delivery: calcLucroDeliveryLiquido no preço que repassa a taxa (calcPrecoBreakEven)
 * Antes (até 2026-11-11) os dois canais eram lucro bruto (sem custos do mês,
 * maquininha nem imposto).
 *
 * @param {object} params
 * @param {object} params.item        - { precoVenda, custoUnitario, custoDelivery? }
 * @param {Array}  params.plataformas - rows delivery_config ativas
 * @param {object} params.contexto    - { fixoPerc, impostoPerc, variavelPerc } em decimal
 * @returns {{ canais: Array, melhorIdx:number, piorIdx:number, temPrejuizo:boolean }}
 */
export function montarCanaisComparativo({ item, plataformas, contexto }) {
  const safe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const custo = safe(item?.custoUnitario);
  // Plataformas usam o custo NO DELIVERY (ingredientes + embalagem de delivery).
  const custoDeliveryCanal = safe(item?.custoDelivery ?? item?.custoUnitario);
  const precoBalcao = safe(item?.precoVenda);

  const canais = [];
  const lucroBalcao = precoBalcao > 0
    ? precoBalcao - custo - precoBalcao * (safe(contexto?.fixoPerc) + safe(contexto?.variavelPerc))
    : 0;
  canais.push({
    key: 'balcao',
    nome: 'Balcão',
    icon: 'shopping-bag',
    preco: precoBalcao,
    lucro: lucroBalcao,
    margem: precoBalcao > 0 ? (lucroBalcao / precoBalcao) * 100 : 0,
    inviavel: precoBalcao <= 0,
  });

  for (const plat of plataformas || []) {
    const precoSugerido = calcPrecoBreakEven(precoBalcao, plat);
    const inviavelPreco = precoSugerido === null || !(precoSugerido > 0);
    const preco = inviavelPreco ? 0 : precoSugerido;
    const r = calcLucroDeliveryLiquido({ precoVenda: preco, cmv: custoDeliveryCanal, plat, contexto });
    const inviavel = inviavelPreco || r.inviavel;
    canais.push({
      key: `plat-${plat.id}`,
      nome: plat.plataforma,
      icon: 'smartphone',
      preco,
      lucro: inviavel ? 0 : r.lucro,
      margem: inviavel ? 0 : r.margem * 100,
      inviavel,
    });
  }

  // Melhor / pior margem (ignora inviáveis)
  let melhorIdx = -1;
  let piorIdx = -1;
  let melhorMargem = -Infinity;
  let piorMargem = Infinity;
  canais.forEach((c, i) => {
    if (c.inviavel) return;
    if (c.margem > melhorMargem) { melhorMargem = c.margem; melhorIdx = i; }
    if (c.margem < piorMargem) { piorMargem = c.margem; piorIdx = i; }
  });
  const temPrejuizo = canais.some(c => !c.inviavel && c.lucro < 0);
  return { canais, melhorIdx, piorIdx, temPrejuizo };
}

export const compararDeliveryVsBalcao = _engCompara;
