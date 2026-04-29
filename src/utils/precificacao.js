/**
 * Engine unificada de precificação — APP-19, 20, 21, 22, 25, 26, 27, 27b.
 *
 * Concentra TODA a lógica de cálculo de preço sugerido (balcão, delivery, combo)
 * em um único lugar. Antes, cada tela calculava por conta própria, gerando
 * divergências de nomenclatura ("lucro" significava coisas diferentes em
 * cada lugar) e fórmulas incompletas (custos fixos não entrando no delivery
 * por exemplo).
 *
 * MÉTODO PRECIFICAÍ — markup divisor por percentuais:
 *
 *   Preço = (CMV + CustosAbsolutos) / [1 - (Lucro% + Fixo% + Variavel%...)]
 *
 * Validação obrigatória: soma dos % < 100%, senão retorna { inviavel: true }.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CONVENÇÕES DE NOMENCLATURA (APP-21):
 *
 * Todos os percentuais aqui são DECIMAIS (0.15 = 15%), sempre sobre o
 * preço de venda — nunca sobre custo.
 *
 * - CMV (R$)              = soma dos custos dos insumos + embalagens + preparos
 * - CMV (%)               = CMV(R$) / Preço × 100  (resultado, não input)
 * - Margem de contribuição (R$) = Preço − CMV − CustosVariáveis
 * - Lucro líquido (R$)    = Preço − CMV − CustosVariáveis − CustosFixosDiluidos
 * - Custo Fixo %          = CustosDoMês / FaturamentoMensal
 *
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Soma defensiva: ignora NaN/null/undefined. */
function safe(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Validação canônica do markup divisor.
 *
 * @param {number} somaPerc - Soma de todos os percentuais (decimais, 0-1+)
 * @returns {object} { ok, nivel, mensagem }
 *   - ok: true se a soma é estritamente < 1
 *   - nivel: 'ok' | 'aviso' | 'critico' | 'inviavel'
 *   - mensagem: texto explicativo pra UI
 */
export function validarSomaPercentual(somaPerc) {
  const s = safe(somaPerc);
  if (s >= 1) {
    return {
      ok: false,
      nivel: 'inviavel',
      mensagem: `Seus percentuais somam ${(s * 100).toFixed(1)}% do preço, ou seja, é impossível ter lucro com esses parâmetros. Reveja seus custos fixos, variáveis ou margem desejada.`,
    };
  }
  if (s >= 0.85) {
    return {
      ok: true,
      nivel: 'critico',
      mensagem: `Seus custos somados (${(s * 100).toFixed(1)}%) deixam apenas ${((1 - s) * 100).toFixed(1)}% para CMV. Margem extremamente apertada — só funciona com produtos de CMV muito baixo.`,
    };
  }
  if (s >= 0.7) {
    return {
      ok: true,
      nivel: 'aviso',
      mensagem: `Seus custos + lucro consomem ${(s * 100).toFixed(1)}% do preço. Margem para CMV apertada (${((1 - s) * 100).toFixed(1)}%).`,
    };
  }
  return { ok: true, nivel: 'ok', mensagem: '' };
}

/**
 * Calcula preço sugerido pelo método Precificaí (markup divisor).
 *
 * @param {object} params
 * @param {number} params.cmv             - Custo do produto em R$
 * @param {number} params.lucroPerc       - Lucro desejado em decimal (0.15 = 15%)
 * @param {number} params.fixoPerc        - Custos fixos % em decimal
 * @param {number} params.variavelPerc    - Soma dos custos variáveis % em decimal
 * @param {number} [params.custosAbsolutos] - Custos em R$ que somam ao numerador (cupons, frete subsidiado)
 * @returns {object} resultado com preco, composicao e diagnostico
 */
export function calcularPrecoSugerido({ cmv, lucroPerc, fixoPerc, variavelPerc, custosAbsolutos = 0 }) {
  const cmvR = safe(cmv);
  const cAbs = safe(custosAbsolutos);
  const lucro = safe(lucroPerc);
  const fixo = safe(fixoPerc);
  const variavel = safe(variavelPerc);
  const somaPerc = lucro + fixo + variavel;

  const validacao = validarSomaPercentual(somaPerc);
  if (!validacao.ok) {
    return {
      preco: 0,
      cmv: cmvR,
      custosAbsolutos: cAbs,
      lucroPerc: lucro,
      fixoPerc: fixo,
      variavelPerc: variavel,
      somaPerc,
      composicao: null,
      validacao,
    };
  }

  const preco = (cmvR + cAbs) / (1 - somaPerc);

  // Composição em R$ pra tela de transparência (APP-19, 25)
  const composicao = {
    cmv: cmvR,
    custosAbsolutos: cAbs,
    lucroR: preco * lucro,
    fixoR: preco * fixo,
    variavelR: preco * variavel,
    cmvPercDoPreco: preco > 0 ? cmvR / preco : 0,
  };

  return {
    preco,
    cmv: cmvR,
    custosAbsolutos: cAbs,
    lucroPerc: lucro,
    fixoPerc: fixo,
    variavelPerc: variavel,
    somaPerc,
    composicao,
    validacao,
  };
}

/**
 * Calcula preço sugerido para BALCÃO.
 *
 * @param {object} params
 * @param {number} params.cmv         - CMV do produto em R$
 * @param {number} params.lucroPerc   - Lucro balcão (decimal)
 * @param {number} params.fixoPerc    - Custos fixos do negócio % (decimal)
 * @param {number} params.variavelPerc - Custos variáveis (imposto + maquininha + outros) % (decimal)
 */
export function calcularPrecoBalcao({ cmv, lucroPerc, fixoPerc, variavelPerc }) {
  return calcularPrecoSugerido({ cmv, lucroPerc, fixoPerc, variavelPerc, custosAbsolutos: 0 });
}

/**
 * Calcula preço sugerido para DELIVERY (APP-25).
 *
 * No delivery:
 *  - maquininha tradicional NÃO entra (substituída pela taxa pagamento online)
 *  - imposto CONTINUA somando
 *  - comissão da plataforma soma
 *  - taxa de pagamento online soma (separada da comissão)
 *  - cupom recorrente em R$ entra como custo absoluto no numerador
 *  - frete subsidiado em R$ entra como custo absoluto no numerador
 *
 * @param {object} params
 * @param {number} params.cmv                  - CMV do produto em R$ (pode incluir embalagem específica de delivery — APP-29c)
 * @param {number} params.lucroPerc            - Lucro desejado delivery (decimal, default = lucro balcão)
 * @param {number} params.fixoPerc             - Custos fixos % (decimal, mesmo do balcão)
 * @param {number} params.impostoPerc          - Imposto % (decimal)
 * @param {number} params.comissaoPerc         - Comissão da plataforma % (decimal)
 * @param {number} params.taxaPagamentoOnlinePerc - Taxa pagamento online % (decimal)
 * @param {number} [params.cupomR]             - Cupom recorrente em R$ (opcional, default 0)
 * @param {number} [params.freteSubsidiadoR]   - Frete subsidiado em R$ (opcional, default 0)
 */
export function calcularPrecoDelivery({
  cmv,
  lucroPerc,
  fixoPerc,
  impostoPerc,
  comissaoPerc,
  taxaPagamentoOnlinePerc,
  cupomR = 0,
  freteSubsidiadoR = 0,
}) {
  const variavelPerc = safe(impostoPerc) + safe(comissaoPerc) + safe(taxaPagamentoOnlinePerc);
  const custosAbsolutos = safe(cupomR) + safe(freteSubsidiadoR);
  const resultado = calcularPrecoSugerido({
    cmv,
    lucroPerc,
    fixoPerc,
    variavelPerc,
    custosAbsolutos,
  });
  // Adiciona breakdown específico de delivery na composição
  if (resultado.composicao) {
    resultado.composicao.delivery = {
      impostoR: resultado.preco * safe(impostoPerc),
      comissaoR: resultado.preco * safe(comissaoPerc),
      taxaPagamentoOnlineR: resultado.preco * safe(taxaPagamentoOnlinePerc),
      cupomR: safe(cupomR),
      freteSubsidiadoR: safe(freteSubsidiadoR),
    };
  }
  return resultado;
}

/**
 * Calcula preço sugerido para COMBO (APP-22).
 *
 * Soma os CMVs dos componentes (insumo/preparo/produto × quantidade),
 * depois aplica markup divisor sobre o total.
 *
 * @param {object} params
 * @param {number} params.cmvCombo        - Soma dos CMVs dos componentes
 * @param {number} params.lucroPerc       - Lucro desejado balcão
 * @param {number} params.fixoPerc        - Custos fixos %
 * @param {number} params.variavelPerc    - Variáveis %
 * @param {number} [params.descontoR]     - Desconto opcional do combo em R$ (subtraído do preço final)
 * @param {number} [params.descontoPerc]  - Desconto opcional do combo em decimal (alternativa a descontoR)
 */
export function calcularPrecoCombo({
  cmvCombo,
  lucroPerc,
  fixoPerc,
  variavelPerc,
  descontoR = 0,
  descontoPerc = 0,
}) {
  const base = calcularPrecoSugerido({
    cmv: cmvCombo,
    lucroPerc,
    fixoPerc,
    variavelPerc,
    custosAbsolutos: 0,
  });

  if (!base.validacao.ok) return base;

  // Aplica desconto. Prioridade: descontoR explícito > descontoPerc
  let precoFinal = base.preco;
  const dR = safe(descontoR);
  const dP = safe(descontoPerc);
  if (dR > 0) {
    precoFinal = Math.max(0, base.preco - dR);
  } else if (dP > 0 && dP < 1) {
    precoFinal = base.preco * (1 - dP);
  }

  // Recalcula composição com preço descontado pra refletir margem real
  const composicaoFinal = base.composicao && precoFinal > 0
    ? {
        cmv: base.cmv,
        custosAbsolutos: 0,
        lucroR: precoFinal - base.cmv - precoFinal * (base.fixoPerc + base.variavelPerc),
        fixoR: precoFinal * base.fixoPerc,
        variavelR: precoFinal * base.variavelPerc,
        cmvPercDoPreco: base.cmv / precoFinal,
      }
    : base.composicao;

  return {
    ...base,
    precoSemDesconto: base.preco,
    preco: precoFinal,
    descontoR: dR,
    descontoPerc: dP,
    composicao: composicaoFinal,
  };
}

/**
 * Compara preço delivery vs balcão (APP-27 — validação automática).
 *
 * @returns {object} { ok, nivel, mensagem }
 */
export function compararDeliveryVsBalcao(precoDelivery, precoBalcao) {
  const d = safe(precoDelivery);
  const b = safe(precoBalcao);
  if (d <= 0 || b <= 0) return { ok: true, nivel: 'ok', mensagem: '' };
  if (d < b) {
    return {
      ok: false,
      nivel: 'critico',
      mensagem: `Erro de cálculo detectado. Preço delivery (R$ ${d.toFixed(2)}) não pode ser menor que balcão (R$ ${b.toFixed(2)}). Reveja os custos da plataforma — provavelmente está faltando comissão, imposto ou taxa de pagamento online.`,
    };
  }
  if (Math.abs(d - b) < 0.01) {
    return {
      ok: false,
      nivel: 'aviso',
      mensagem: 'Preço delivery igual ao balcão. Verifique se a plataforma está cadastrada com todas as taxas (comissão + taxa de pagamento online + imposto).',
    };
  }
  const aumento = ((d - b) / b) * 100;
  return {
    ok: true,
    nivel: 'ok',
    mensagem: `Delivery ${aumento.toFixed(0)}% mais caro que balcão (esperado pela soma das taxas da plataforma).`,
  };
}

/**
 * Calcula margem de contribuição (R$ e %).
 *
 * Conceito padronizado (APP-21):
 *   Margem de contribuição (R$) = Preço − CMV − CustosVariáveis(R$)
 *   Margem de contribuição (%)  = MC / Preço × 100
 */
export function calcularMargemContribuicao({ preco, cmv, variavelPerc }) {
  const p = safe(preco);
  const c = safe(cmv);
  const v = safe(variavelPerc);
  const variavelR = p * v;
  const mcR = p - c - variavelR;
  const mcP = p > 0 ? mcR / p : 0;
  return { mcR, mcP, variavelR };
}

/**
 * Calcula lucro líquido (R$ e %).
 *
 * Conceito padronizado (APP-21):
 *   Lucro líquido (R$) = Preço − CMV − Variáveis − Fixos diluídos
 *   Lucro líquido (%)  = LL / Preço × 100
 */
export function calcularLucroLiquido({ preco, cmv, variavelPerc, fixoPerc }) {
  const p = safe(preco);
  const c = safe(cmv);
  const v = safe(variavelPerc);
  const f = safe(fixoPerc);
  const variavelR = p * v;
  const fixoR = p * f;
  const llR = p - c - variavelR - fixoR;
  const llP = p > 0 ? llR / p : 0;
  return { llR, llP, variavelR, fixoR };
}

/**
 * Helper: converte percentual de input do usuário (string ou number) para decimal.
 *
 * Aceita:
 *   "15"   → 0.15
 *   "15,5" → 0.155
 *   0.15   → 0.15  (já decimal)
 *   15     → 0.15  (assume que > 1 é "%" como inteiro)
 */
export function pctToDecimal(input) {
  if (input == null) return 0;
  let n;
  if (typeof input === 'number') {
    n = input;
  } else {
    n = parseFloat(String(input).replace(',', '.'));
  }
  if (!Number.isFinite(n)) return 0;
  if (n > 1) return n / 100;
  return n;
}

export const PERCS_BALCAO_LABEL = {
  lucroPerc: 'Lucro desejado',
  fixoPerc: 'Custos fixos',
  variavelPerc: 'Custos variáveis (imposto, maquininha, etc.)',
};

export const PERCS_DELIVERY_LABEL = {
  lucroPerc: 'Lucro desejado delivery',
  fixoPerc: 'Custos fixos',
  impostoPerc: 'Imposto',
  comissaoPerc: 'Comissão da plataforma',
  taxaPagamentoOnlinePerc: 'Taxa de pagamento online',
};
