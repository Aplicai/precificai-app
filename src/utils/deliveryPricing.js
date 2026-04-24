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
    comissaoPct: safeNum(plat?.comissao_app ?? plat?.taxa_plataforma) / 100,
    descontoPct: safeNum(plat?.desconto_promocao) / 100,
    cupomR$: safeNum(plat?.embalagem_extra),
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

  const numerador = p.cupomR$ * (1 - p.comissaoPct) + p.taxaEntregaR$ + custo;
  const divisorAlvo = (1 - p.descontoPct) * (1 - p.comissaoPct) - m;
  const divisorMin = (1 - p.descontoPct) * (1 - p.comissaoPct);

  const precoSugeridoBruto = (Number.isFinite(divisorAlvo) && divisorAlvo > 0) ? numerador / divisorAlvo : null;
  const precoMinimoBruto = (Number.isFinite(divisorMin) && divisorMin > 0)
    ? (custo + p.cupomR$ * (1 - p.comissaoPct) + p.taxaEntregaR$) / divisorMin
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
