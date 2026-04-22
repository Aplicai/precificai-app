/**
 * pricingSuggestion service (M1-23 — versão local sem IA)
 *
 * Sugestão de preço 100% local, sem chamada externa, sem custo.
 * Usa fórmula clássica de markup:
 *   preço = CMV / (1 − despVar% − despFix% − margem_alvo)
 *
 * Também devolve:
 *   - preço psicológico (arredondado pra ,90 / ,99)
 *   - faixa recomendada (±10%)
 *   - margem resultante real
 *   - racional em pt-BR explicando o cálculo
 *   - alertas (margem inviável, acima/abaixo da média da categoria, etc.)
 *
 * Mantém a mesma assinatura do antigo wrapper IA pra UI não precisar mudar.
 */

/**
 * Coleta contexto financeiro do usuário (despesas, lucro alvo).
 */
export async function gatherFinancialContext(db) {
  if (!db) return { despesas_fixas_pct: 0, despesas_variaveis_pct: 0, margem_alvo: 0.3 };

  try {
    const [config, fixas, variaveis] = await Promise.all([
      db.getFirstAsync('SELECT * FROM configuracao LIMIT 1').catch(() => null),
      db.getAllAsync('SELECT * FROM despesas_fixas').catch(() => []),
      db.getAllAsync('SELECT * FROM despesas_variaveis').catch(() => []),
    ]);

    const margem_alvo = Number(config?.lucro_desejado) || 0.3;
    const totalFixas = (fixas || []).reduce((s, f) => s + (Number(f.valor) || 0), 0);
    const faturamento = Number(config?.faturamento_estimado) || 0;
    const despesas_fixas_pct = faturamento > 0 ? totalFixas / faturamento : 0;
    const despesas_variaveis_pct = (variaveis || []).reduce(
      (s, v) => s + (Number(v.percentual) || 0),
      0,
    );

    return {
      margem_alvo: clamp(margem_alvo, 0, 0.95),
      despesas_fixas_pct: clamp(despesas_fixas_pct, 0, 0.95),
      despesas_variaveis_pct: clamp(despesas_variaveis_pct, 0, 0.95),
    };
  } catch {
    return { despesas_fixas_pct: 0, despesas_variaveis_pct: 0, margem_alvo: 0.3 };
  }
}

/**
 * Busca preço médio dos outros produtos da mesma categoria (referência).
 */
export async function getCategoriaMedia(db, categoriaId, excludeProdutoId = null) {
  if (!db || !categoriaId) return null;
  try {
    const rows = await db.getAllAsync(
      'SELECT preco_venda FROM produtos WHERE categoria_id = ? AND preco_venda > 0',
      [categoriaId],
    );
    const filtered = (rows || []).filter(
      (r) => excludeProdutoId == null || r.id !== excludeProdutoId,
    );
    if (!filtered.length) return null;
    const total = filtered.reduce((s, r) => s + Number(r.preco_venda || 0), 0);
    return total / filtered.length;
  } catch {
    return null;
  }
}

/**
 * Busca histórico recente de vendas (últimas 5).
 */
export async function getHistoricoVendas(db, produtoId) {
  if (!db || !produtoId) return [];
  try {
    const rows = await db.getAllAsync(
      'SELECT data, quantidade FROM vendas WHERE produto_id = ? ORDER BY data DESC',
      [produtoId],
    );
    return (rows || []).slice(0, 5).map((r) => ({
      data: r.data,
      preco: 0,
      vendas: Number(r.quantidade) || 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Sugere preço de venda usando fórmula local (sem IA, sem chamada externa).
 *
 * Fórmula: preço = CMV / (1 − despVar% − despFix% − margem_alvo)
 *
 * @param {Object} input
 * @param {string} input.produto_nome
 * @param {string} [input.categoria]
 * @param {number} input.cmv
 * @param {number} [input.preco_atual]
 * @param {number} [input.margem_alvo]            (0..1, ex: 0.3 = 30%)
 * @param {number} [input.despesas_fixas_pct]     (0..1)
 * @param {number} [input.despesas_variaveis_pct] (0..1)
 * @param {number} [input.preco_medio_categoria]
 * @param {Array}  [input.historico]
 * @returns {Promise<{preco_sugerido, preco_psicologico, faixa_recomendada, margem_resultante, racional, alertas}>}
 */
export async function suggestPrice(input) {
  const cmv = Math.max(0, Number(input?.cmv) || 0);
  const despVar = clamp(Number(input?.despesas_variaveis_pct) || 0, 0, 0.95);
  const despFix = clamp(Number(input?.despesas_fixas_pct) || 0, 0, 0.95);
  const margemAlvo = clamp(Number(input?.margem_alvo) || 0.3, 0, 0.9);
  const precoMedioCat = Number(input?.preco_medio_categoria) || 0;
  const precoAtual = Number(input?.preco_atual) || 0;
  const nome = (input?.produto_nome || 'este produto').trim();
  const categoria = (input?.categoria || '').trim();

  const alertas = [];

  // Validações
  if (cmv <= 0) {
    throw new Error('Adicione o custo do produto (CMV) antes de calcular a sugestão.');
  }

  // Denominador da fórmula de markup
  const denom = 1 - despVar - despFix - margemAlvo;

  let precoSugerido;
  let margemResultante;

  if (denom <= 0.05) {
    // Margem alvo + despesas consomem ≥95% do preço — fórmula instável.
    // Cai pro break-even × (1 + margem_alvo) como fallback razoável.
    const piso = cmv / Math.max(0.05, 1 - despVar - despFix);
    precoSugerido = piso * (1 + margemAlvo);
    margemResultante = (precoSugerido - cmv - (despVar + despFix) * precoSugerido) / precoSugerido;
    alertas.push(
      `Suas despesas (${pct(despVar + despFix)}) somadas à margem alvo (${pct(margemAlvo)}) ` +
      `passam de 95% do preço. Considere reduzir despesas ou margem alvo pra um cálculo mais firme.`,
    );
  } else {
    precoSugerido = cmv / denom;
    margemResultante = margemAlvo; // por construção
  }

  // Arredondamento — preço comercial em centavos
  precoSugerido = Math.round(precoSugerido * 100) / 100;

  // Preço psicológico — vai pro ,90 ou ,99 mais próximo
  const precoPsicologico = psyco(precoSugerido);

  // Faixa recomendada — ±10% do sugerido
  const faixaMin = Math.round(precoSugerido * 0.9 * 100) / 100;
  const faixaMax = Math.round(precoSugerido * 1.1 * 100) / 100;

  // Recalcula margem resultante (caso tenha caído no fallback)
  const margemFinal =
    (precoSugerido - cmv - (despVar + despFix) * precoSugerido) / precoSugerido;

  // Racional em pt-BR
  const racional = montarRacional({
    nome,
    categoria,
    cmv,
    despVar,
    despFix,
    margemAlvo,
    precoSugerido,
    margemFinal,
  });

  // Alertas adicionais
  if (margemFinal < 0.15) {
    alertas.push(
      `Margem real de ${pct(margemFinal)} — pouca folga pra imprevistos. ` +
      `Considere subir a margem alvo ou reduzir custos.`,
    );
  }
  if (margemAlvo > 0.5) {
    alertas.push(
      `Margem alvo alta (${pct(margemAlvo)}) — confirme se o mercado aceita esse preço.`,
    );
  }
  if (precoMedioCat > 0) {
    const ratio = precoSugerido / precoMedioCat;
    if (ratio > 1.3) {
      alertas.push(
        `Preço sugerido está ${pct(ratio - 1)} acima da média da categoria ` +
        `(${formatBRL(precoMedioCat)}). Verifique posicionamento.`,
      );
    } else if (ratio < 0.7) {
      alertas.push(
        `Preço sugerido está ${pct(1 - ratio)} abaixo da média da categoria ` +
        `(${formatBRL(precoMedioCat)}). Pode ser oportunidade ou margem apertada.`,
      );
    }
  }
  if (precoAtual > 0) {
    const diff = (precoSugerido - precoAtual) / precoAtual;
    if (Math.abs(diff) > 0.15) {
      alertas.push(
        diff > 0
          ? `Sugerido ${pct(diff)} acima do preço atual (${formatBRL(precoAtual)}).`
          : `Sugerido ${pct(-diff)} abaixo do preço atual (${formatBRL(precoAtual)}).`,
      );
    }
  }

  return {
    preco_sugerido: precoSugerido,
    preco_psicologico: precoPsicologico,
    faixa_recomendada: { min: faixaMin, max: faixaMax },
    margem_resultante: Math.max(0, margemFinal),
    racional,
    alertas,
  };
}

// === Helpers ==============================================================

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function pct(n) {
  return `${(Number(n) * 100).toFixed(1)}%`;
}

function formatBRL(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Arredonda preço pro ,90 ou ,99 mais próximo abaixo (psicológico).
 * Ex: 12.34 → 11.99 ; 12.85 → 12.90 ; 13.05 → 12.99
 */
function psyco(preco) {
  if (preco <= 0) return 0;
  if (preco < 1) return Math.max(0.99, Math.round(preco * 100) / 100);
  const inteiro = Math.floor(preco);
  const candidatos = [
    inteiro - 0.01, // X,99 abaixo
    inteiro - 0.10, // X,90 abaixo
    inteiro + 0.90, // X,90 acima
    inteiro + 0.99, // X,99 acima
  ].filter((c) => c > 0);
  let melhor = candidatos[0];
  let menorDist = Math.abs(preco - melhor);
  for (const c of candidatos) {
    const d = Math.abs(preco - c);
    if (d < menorDist) {
      menorDist = d;
      melhor = c;
    }
  }
  return Math.round(melhor * 100) / 100;
}

function montarRacional({ nome, categoria, cmv, despVar, despFix, margemAlvo, precoSugerido, margemFinal }) {
  const partes = [];
  partes.push(
    `Pra ${nome}${categoria ? ` (${categoria})` : ''} com custo de ${formatBRL(cmv)}, ` +
    `o preço sugerido é ${formatBRL(precoSugerido)}.`,
  );
  partes.push(
    `Cálculo: CMV ÷ (1 − despesas variáveis ${pct(despVar)} − ` +
    `despesas fixas ${pct(despFix)} − margem alvo ${pct(margemAlvo)}).`,
  );
  partes.push(
    `Resultado: lucro real de ${pct(margemFinal)} sobre o preço de venda, ` +
    `cobrindo todas as despesas operacionais.`,
  );
  return partes.join(' ');
}
