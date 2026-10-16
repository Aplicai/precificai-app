import { getDatabase } from '../database/database';

// ========== PARSER NUMÉRICO PT-BR ==========
//
// Sessão 28.27: helper canônico pra aceitar input do usuário em PT-BR.
// Usuária digita "10,50" ou "10.50" — ambos devem virar 10.5.
// parseFloat("10,50") === 10 → BUG silencioso. Sempre usar este helper
// em onChangeText de TextInput numérico.
//
// Aceita:
//   "10,5"  → 10.5
//   "10.5"  → 10.5
//   "1.000,50" → 1000.5  (separadores de milhar PT-BR)
//   "1,000.50" → 1000.5  (separadores de milhar EN-US)
//   "abc"   → NaN
//   ""      → NaN
//   null/undefined → NaN
//   number  → returned as-is
//
// Para "0 ou número válido" use parseDecimalBROrZero.
export function parseDecimalBR(input) {
  if (input == null) return NaN;
  if (typeof input === 'number') return input;
  let s = String(input).trim();
  if (!s) return NaN;
  // Detecta se a vírgula é decimal ou milhar:
  // - Se tem ambos . e ,, o último é decimal e o outro é milhar
  // - Se só tem , → vírgula é decimal (PT-BR padrão)
  // - Se só tem . → ponto é decimal (EN-US)
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // 1.000,50 — pontos são milhar, vírgula é decimal
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,000.50 — vírgulas são milhar, ponto é decimal
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

export function parseDecimalBROrZero(input) {
  const n = parseDecimalBR(input);
  return Number.isFinite(n) ? n : 0;
}

// ========== SISTEMA DE UNIDADES ==========

// Tipos de unidade e suas conversões para a base (g, mL, un)
export const UNIDADES_MEDIDA = [
  { label: 'Quilograma (kg)', value: 'kg', tipo: 'peso', fatorBase: 1000 },
  { label: 'Grama (g)', value: 'g', tipo: 'peso', fatorBase: 1 },
  { label: 'Litro (L)', value: 'L', tipo: 'volume', fatorBase: 1000 },
  { label: 'Mililitro (mL)', value: 'mL', tipo: 'volume', fatorBase: 1 },
  { label: 'Unidade (un)', value: 'un', tipo: 'unidade', fatorBase: 1 },
];

// Converte qualquer valor para a unidade base (g, mL ou un)
function _findUnidade(unidade) {
  // Audit: aceita variantes legadas ("Quilograma(s)", "Litro(s)", "KG", "l") —
  // 98 insumos em prod ainda têm essas grafias; antes passavam cru (sem ×1000).
  return UNIDADES_MEDIDA.find(u => u.value === unidade)
    || UNIDADES_MEDIDA.find(u => u.value === normalizarUnidade(unidade));
}

export function converterParaBase(valor, unidade) {
  const un = _findUnidade(unidade);
  if (!un) return valor;
  return valor * un.fatorBase;
}

// Converte da unidade base para a unidade desejada
export function converterDeBase(valorBase, unidade) {
  const un = _findUnidade(unidade);
  if (!un || un.fatorBase === 0) return valorBase;
  return valorBase / un.fatorBase;
}

/**
 * Custo do preparo "por kg" (convenção interna: custo por 1000 unidades-base —
 * g, mL ou un). Audit: 7 call-sites faziam `custoTotal / rendimento * 1000`
 * ignorando a unidade do rendimento; preparo "rende 2 kg" saía 1000× maior.
 */
export function calcCustoPorKgPreparo(custoTotal, rendimentoTotal, unidadeMedida) {
  const custo = _safeNum(custoTotal);
  const rend = _safeNum(rendimentoTotal);
  if (rend <= 0 || !Number.isFinite(custo)) return 0;
  const rendBase = converterParaBase(rend, unidadeMedida || 'g');
  return rendBase > 0 ? (custo / rendBase) * 1000 : 0;
}

/**
 * Inverso de calcCustoPorKgPreparo: custo do rendimento inteiro a partir do
 * custo_por_kg. custo_por_kg é a fonte que produtos/cascade leem; derivar o
 * total dele evita exibir um custo_total gravado e desatualizado.
 */
export function calcCustoTotalPreparo(custoPorKg, rendimentoTotal, unidadeMedida) {
  return calcCustoPreparo(custoPorKg, rendimentoTotal, unidadeMedida || 'g');
}

/**
 * Custo pra exibir em listas, na unidade do selo (kg, L ou un): custo_por_kg
 * é por 1000 unidades-base, então receita em unidade divide por 1000.
 */
export function calcCustoListaPreparo(custoPorKg, unidadeMedida) {
  const custo = _safeNum(custoPorKg);
  if (custo <= 0) return 0;
  return getTipoUnidade(unidadeMedida) === 'unidade' ? custo / 1000 : custo;
}

/** Rótulo do custo na lista de receitas base: "R$ 18,32/kg", "R$ 12,00/L", "R$ 1,50/un". */
export function formatCustoListaPreparo(custoPorKg, unidadeMedida) {
  const tipo = getTipoUnidade(unidadeMedida);
  const sufixo = tipo === 'peso' ? 'kg' : tipo === 'volume' ? 'L' : 'un';
  return `${formatCurrency(calcCustoListaPreparo(custoPorKg, unidadeMedida))}/${sufixo}`;
}

/**
 * Reajuste em massa de receita base. Parte do total derivado de custo_por_kg
 * (não do custo_total gravado, que pode estar desatualizado) e devolve os dois
 * campos coerentes. mode: 'percent' | 'value' (R$ somados ao total).
 */
export function reajusteCustoPreparo(preparo, mode, sign, value) {
  const unidade = preparo?.unidade_medida || 'g';
  const rend = _safeNum(preparo?.rendimento_total);
  const antigo = rend > 0
    ? calcCustoTotalPreparo(preparo?.custo_por_kg, rend, unidade)
    : _safeNum(preparo?.custo_total);
  let novo = mode === 'percent'
    ? antigo * (1 + (sign * _safeNum(value)) / 100)
    : antigo + sign * _safeNum(value);
  if (!(novo > 0)) novo = 0;
  const custoPorKg = rend > 0 ? calcCustoPorKgPreparo(novo, rend, unidade) : novo;
  return { custo_total: novo, custo_por_kg: custoPorKg };
}

/**
 * Custo ATUAL de todas as receitas base a partir das linhas e dos preços de hoje
 * (mesma fórmula do cascadeRecalc.recalcularPreparo, mas em memória e de uma vez):
 *   Σ insumos (preco_por_kg do insumo) + Σ sub-receitas (custo_por_kg da sub)
 *   + Σ embalagens (preco_unitario × qtd).
 * Sub-receitas resolvidas iterando até estabilizar (ordem não importa).
 *
 * Receita SEM nenhuma linha fica de fora do resultado (custo digitado à mão —
 * não há de onde recalcular). Entradas: arrays crus das tabelas.
 * Retorna Map(id → { custo_total, custo_por_kg }).
 */
export function calcCustosPreparos({
  preparos = [], ingredientes = [], materias = [],
  subpreparos = [], embalagensLinhas = [], embalagens = [],
} = {}) {
  const mpMap = new Map((materias || []).map(m => [m.id, m]));
  const embMap = new Map((embalagens || []).map(e => [e.id, e]));
  const prepMap = new Map((preparos || []).map(p => [p.id, p]));
  const group = (rows) => {
    const g = new Map();
    (rows || []).forEach(r => {
      if (!g.has(r.preparo_id)) g.set(r.preparo_id, []);
      g.get(r.preparo_id).push(r);
    });
    return g;
  };
  const ingsBy = group(ingredientes);
  const subsBy = group(subpreparos);
  const embsBy = group(embalagensLinhas);

  // Parte que não depende de sub-receita: insumos + embalagens.
  const base = new Map();
  for (const p of prepMap.values()) {
    const ings = ingsBy.get(p.id) || [];
    const subs = subsBy.get(p.id) || [];
    const embs = embsBy.get(p.id) || [];
    if (ings.length + subs.length + embs.length === 0) continue;
    const custoIng = ings.reduce((a, i) => {
      const mp = mpMap.get(i.materia_prima_id);
      return mp ? a + calcCustoIngrediente(mp.preco_por_kg, i.quantidade_utilizada, mp.unidade_medida, mp.unidade_medida) : a;
    }, 0);
    const custoEmb = embs.reduce((a, l) => {
      const em = embMap.get(l.embalagem_id);
      return em ? a + _safeNum(em.preco_unitario) * _safeNum(l.quantidade_utilizada) : a;
    }, 0);
    base.set(p.id, custoIng + custoEmb);
  }

  // custo_por_kg corrente de cada receita: começa no gravado (vale para as
  // receitas sem linhas) e é substituído pelo calculado a cada passada.
  const cpk = new Map([...prepMap.values()].map(p => [p.id, _safeNum(p.custo_por_kg)]));
  const out = new Map();
  const maxPasses = Math.min(prepMap.size + 1, 12);
  for (let pass = 0; pass < maxPasses; pass++) {
    let mudou = false;
    for (const [id, custoBase] of base) {
      const p = prepMap.get(id);
      const custoSubs = (subsBy.get(id) || []).reduce((a, s) => {
        const sub = prepMap.get(s.sub_preparo_id);
        return sub ? a + calcCustoPreparo(cpk.get(sub.id), s.quantidade_utilizada, sub.unidade_medida || 'g') : a;
      }, 0);
      const total = custoBase + custoSubs;
      const rend = _safeNum(p.rendimento_total);
      const porKg = rend > 0 ? calcCustoPorKgPreparo(total, rend, p.unidade_medida) : total;
      if (!out.has(id) || Math.abs(porKg - cpk.get(id)) > 1e-9) mudou = true;
      cpk.set(id, porKg);
      out.set(id, { custo_total: total, custo_por_kg: porKg });
    }
    if (!mudou) break;
  }
  return out;
}

/**
 * true quando o custo gravado difere do calculado o bastante pra regravar.
 * As colunas são REAL (float4 no Postgres, ~7 dígitos): comparação exata
 * regravaria sempre. Tolerância: meio milésimo de real ou 1e-5 relativo.
 */
export function custoPreparoDifere(gravado, calculado) {
  const a = _safeNum(gravado);
  const b = _safeNum(calculado);
  return Math.abs(a - b) > Math.max(0.0005, 1e-5 * Math.max(Math.abs(a), Math.abs(b)));
}

/**
 * Rendimento de receita base pra exibir: "600 g", "1,5 kg", "400 mL", "2 L",
 * "30 unidades". Aceita unidades legadas ("Grama(s)", "Mililitro(s)") e
 * rendimento gravado em kg/L (converte pra base antes de escolher a escala).
 */
export function formatRendimentoPreparo(valor, unidade) {
  const v = _safeNum(valor);
  const tipo = getTipoUnidade(unidade || 'g');
  const fmt = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
  if (tipo === 'unidade') return `${fmt(v)} ${v === 1 ? 'unidade' : 'unidades'}`;
  const baseVal = converterParaBase(v, unidade || 'g');
  const [menor, maior] = tipo === 'peso' ? ['g', 'kg'] : ['mL', 'L'];
  if (baseVal >= 1000) return `${fmt(baseVal / 1000)} ${maior}`;
  return `${fmt(baseVal)} ${menor}`;
}

// Normaliza uma string de unidade para um dos valores canônicos
// ('g','kg','mL','L','un'), reconhecendo variantes comuns digitadas pelo
// usuário ou vindas de dados legados/corrompidos.
// Conceitualmente espelha shortUnidade (EntityCreateModal), implementado local
// aqui pra não criar dependência cruzada.
// Retorna null se não reconhecer.
export function normalizarUnidade(unidade) {
  const raw = String(unidade == null ? '' : unidade).trim();
  if (!raw) return null;
  // Match exato preserva caixa correta (mL ≠ ml, L ≠ l) — caso canônico já reconhecido
  if (raw === 'g' || raw === 'kg' || raw === 'mL' || raw === 'L' || raw === 'un') return raw;
  const u = raw.toLowerCase().replace(/\.+$/, ''); // remove ponto final ('un.', 'g.', 'kg.')
  if (u === 'kg' || u === 'quilo' || u === 'quilos' || u === 'quilograma' || u === 'quilogramas' || u.includes('quilo')) return 'kg';
  // Audit: "Grama(s)" (legado, 46 preparos em prod) caía em null → 'unidade' → custo 1000×.
  if (u === 'g' || u === 'grama' || u === 'gramas' || u.includes('gram')) return 'g';
  if (u === 'ml' || u === 'mililitro' || u === 'mililitros' || u.includes('mili')) return 'mL';
  if (u === 'l' || u === 'litro' || u === 'litros' || u.includes('litro')) return 'L';
  if (u === 'un' || u === 'unidade' || u === 'unidades' || u.includes('unid')) return 'un';
  return null;
}

// Retorna o tipo da unidade (peso, volume, unidade)
export function getTipoUnidade(unidade) {
  const un = UNIDADES_MEDIDA.find(u => u.value === unidade);
  if (un) return un.tipo;
  // Tenta normalizar variantes ('unidades', 'un.', 'quilo'...) antes do fallback
  const canon = normalizarUnidade(unidade);
  if (canon) {
    const un2 = UNIDADES_MEDIDA.find(u => u.value === canon);
    if (un2) return un2.tipo;
  }
  // Fallback: 'unidade' (multiplicação direta, sem ×1000) é menos perigoso que
  // 'peso' para dados não reconhecidos/corrompidos.
  return 'unidade';
}

// Retorna o label do preço base (R$/kg, R$/L, R$/un)
export function getLabelPrecoBase(unidade) {
  const tipo = getTipoUnidade(unidade);
  if (tipo === 'peso') return 'Preço por Kg';
  if (tipo === 'volume') return 'Preço por Litro';
  return 'Preço por Unidade';
}

/**
 * Calcula o preço por unidade base (Kg, Litro ou Unidade).
 *
 * valorPago: quanto pagou pelo produto
 * quantidadeLiquida: quantidade aproveitável na unidade original
 * unidade: unidade de medida selecionada
 */
export function calcPrecoBase(valorPago, quantidadeLiquida, unidade) {
  const valor = _safeNum(valorPago);
  const qtd = _safeNum(quantidadeLiquida);
  if (qtd <= 0) return 0;
  const tipo = getTipoUnidade(unidade);
  if (tipo === 'unidade') {
    return valor / qtd;
  }
  const qtBaseGramas = converterParaBase(qtd, unidade);
  if (qtBaseGramas <= 0) return 0;
  // Para peso e volume: preço por 1000 unidades base (= 1kg ou 1L)
  return (valor / qtBaseGramas) * 1000;
}

/**
 * Calcula o fator de correção (perda no manuseio): liquida / bruta.
 * Atualmente o cálculo é feito inline em MateriaPrimaFormScreen — mantido aqui
 * pra eventual centralização.
 */
export function calcFatorCorrecao(quantidadeBruta, quantidadeLiquida) {
  const bruta = _safeNum(quantidadeBruta);
  const liquida = _safeNum(quantidadeLiquida);
  if (bruta <= 0) return 1;
  return liquida / bruta;
}

// Calcula preço unitário da embalagem
export function calcPrecoUnitarioEmbalagem(precoEmbalagem, quantidade) {
  const preco = _safeNum(precoEmbalagem);
  const qtd = _safeNum(quantidade);
  if (qtd <= 0) return 0;
  return preco / qtd;
}

// Helper interno — converte qualquer valor pra número finito ou 0 (defensa NaN/null/undefined/string)
// Sessão 28.9 — Auditoria P1-05: garantir que entradas inválidas não propagem NaN no cálculo final.
function _safeNum(v) {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseDecimalBR(v);
  return Number.isFinite(n) ? n : 0;
}

// Calcula o custo de um ingrediente no produto
// precoBase: preço por kg, litro ou unidade
// quantidadeUtilizada: quantidade na unidade informada
// unidadeIngrediente: unidade do ingrediente cadastrado
// unidadeUso: unidade em que a quantidade foi informada no produto
export function calcCustoIngrediente(precoBase, quantidadeUtilizada, unidadeIngrediente, unidadeUso) {
  const preco = _safeNum(precoBase);
  const qtd = _safeNum(quantidadeUtilizada);
  if (preco <= 0 || qtd <= 0) return 0;
  const tipo = getTipoUnidade(unidadeIngrediente || 'g');
  if (tipo === 'unidade') {
    return preco * qtd;
  }
  // Converter quantidade usada para base (g ou mL)
  const qtBase = converterParaBase(qtd, unidadeUso || unidadeIngrediente || 'g');
  // precoBase é por 1000 unidades base (1kg ou 1L)
  return (qtBase / 1000) * preco;
}

// Calcula o custo de um preparo no produto
export function calcCustoPreparo(custoKgPreparo, quantidadeUtilizada, unidadeUso) {
  const custo = _safeNum(custoKgPreparo);
  const qtd = _safeNum(quantidadeUtilizada);
  if (custo <= 0 || qtd <= 0) return 0;
  const qtBase = converterParaBase(qtd, unidadeUso || 'g');
  return (qtBase / 1000) * custo;
}

// Calcula o custo de uma embalagem no produto
export function calcCustoEmbalagem(precoUnitario, quantidadeUtilizada) {
  return _safeNum(precoUnitario) * _safeNum(quantidadeUtilizada);
}

// Calcula o total de despesas fixas como percentual do faturamento
export function calcDespesasFixasPercentual(totalDespesasFixas, faturamentoMedio) {
  const total = _safeNum(totalDespesasFixas);
  const fat = _safeNum(faturamentoMedio);
  if (fat <= 0) return 0;
  return total / fat;
}

// Calcula o Mark-up
// Sessão 28.9 — Auditoria: garantir que entradas inválidas (NaN, negativas) não quebrem.
export function calcMarkup(despesasFixasPerc, despesasVariaveisPerc, lucroDesejado) {
  const df = Math.max(0, _safeNum(despesasFixasPerc));
  const dv = Math.max(0, _safeNum(despesasVariaveisPerc));
  const ld = Math.max(0, _safeNum(lucroDesejado));
  const denominador = df + dv + ld;
  if (denominador >= 1) return 0; // matemática inviável: gastos+lucro ≥ 100%
  return 1 / (1 - denominador);
}

// Calcula preço sugerido via mark-up.
// margemSegurancaPerc (decimal, ex: 0.1 = 10%) protege o CMV contra alta de
// fornecedor: infla o custo usado no preço SEM precisar reajustar manualmente.
// Default 0 → comportamento inalterado.
export function calcPrecoSugerido(custoTotal, markup, margemSegurancaPerc = 0) {
  const cmvProtegido = _safeNum(custoTotal) * (1 + _safeNum(margemSegurancaPerc));
  return cmvProtegido * _safeNum(markup);
}

// Config de precificação do produto a partir das linhas do Financeiro
// (configuracao, despesas_fixas, despesas_variaveis, faturamento_mensal).
// Faturamento = média dos meses com valor > 0; sem lucro_desejado → 15%.
export function buildPricingConfig({ cfgs, fixas, vars, fat } = {}) {
  const cfg = (cfgs && cfgs[0]) || {};
  const totalFixas = (fixas || []).reduce((a, d) => a + _safeNum(d.valor), 0);
  const despVarPerc = (vars || []).reduce((a, d) => a + _safeNum(d.percentual), 0);
  const mesesComFat = (fat || []).filter(f => _safeNum(f.valor) > 0);
  const fatMedio = mesesComFat.length > 0
    ? mesesComFat.reduce((a, f) => a + _safeNum(f.valor), 0) / mesesComFat.length
    : 0;
  const despFixasPerc = calcDespesasFixasPercentual(totalFixas, fatMedio);
  const lucroDesejado = _safeNum(cfg.lucro_desejado) || 0.15;
  return {
    despFixasPerc,
    despVarPerc,
    lucroDesejado,
    markup: calcMarkup(despFixasPerc, despVarPerc, lucroDesejado),
    margemSeguranca: _safeNum(cfg.margem_seguranca),
  };
}

/**
 * Determina o divisor correto para o custo unitário de um produto.
 * - Produtos vendidos por kg/litro usam `rendimento_total` (valor em kg/L)
 * - Por unidade usam `rendimento_unidades` (qtd de unidades por receita)
 *
 * Suporta valores novos ('por_kg', 'por_litro') E legados ('Grama(s)', etc).
 *
 * ⚠️ Sessão 28.9 — Auditoria P1-04: HEURÍSTICA LEGADO TEM LIMITAÇÃO.
 * Para produtos cadastrados antes da migration de unidade_rendimento, usa:
 *    se unidade_rendimento contém 'grama'/'quilo'/'litro'/'ml' E rt ≤ 50
 *    → assume venda por kg/litro
 *
 * Falha em casos limítrofes:
 *  - Bolo legado de 100g salvo como `Grama(s)` + rt=100 → classificado como UNIDADE (errado)
 *  - Bolo legado de 1.5kg salvo como `Grama(s)` + rt=1500 → classificado como UNIDADE
 *
 * Mitigação: novos produtos usam enum explícito (`por_kg`, `por_litro`, `por_unidade`)
 * via "Como você vende?" no form. Heurística só afeta produtos pré-2025.
 *
 * Para eliminar a heurística no futuro: rodar migration que infere o tipo
 * a partir dos dados existentes e atualiza unidade_rendimento.
 */
export function getDivisorRendimento(produto) {
  const un = (produto.unidade_rendimento || '').toLowerCase();

  // Novos valores explícitos
  if (un === 'por_kg' || un === 'por_litro') {
    return parseFloat(produto.rendimento_total) || 1;
  }
  if (un === 'por_unidade') {
    return parseFloat(produto.rendimento_unidades) || 1;
  }

  // Heurística para valores legados: Grama(s)/Mililitro(s)/Quilo(s)/Litro(s) com
  // rendimento_total PEQUENO (≤ 50) = venda por kg/litro (o rt já está em kg/L).
  // rt grande (ex.: 1500g de UMA unidade) = venda por unidade → divide por rendimento_unidades.
  // Sessão 25/06: REVERTIDO da versão determinística-por-string (sem guarda rt≤50),
  // que classificava TODO produto 'Grama(s)' como kg e despencava o custo/sugerido
  // dos produtos legados vendidos por unidade.
  // CR-4: Number.isFinite — NaN cai no fallback `unidade` (não causa Infinity no CMV).
  const rtRaw = parseFloat(produto.rendimento_total);
  const rt = Number.isFinite(rtRaw) ? rtRaw : 0;
  const isLegacyKgLitro = (un.includes('grama') || un.includes('quilo') || un.includes('litro') || un.includes('ml'))
    && rt > 0 && rt <= 50;

  if (isLegacyKgLitro) {
    return rt;
  }

  // Padrão: venda por unidade
  return parseFloat(produto.rendimento_unidades) || 1;
}

// Retorna o tipo de venda do produto: 'kg', 'litro' ou 'unidade'
// Suporta valores novos e legados com a mesma heurística de getDivisorRendimento.
export function getTipoVenda(produto) {
  const un = (produto.unidade_rendimento || '').toLowerCase();

  // Novos valores explícitos
  if (un === 'por_kg') return 'kg';
  if (un === 'por_litro') return 'litro';
  if (un === 'por_unidade') return 'unidade';

  // Heurística para valores legados — SÓ classifica kg/litro quando rendimento_total
  // é pequeno (≤ 50 = valor real em kg/L). rt grande = gramas de UMA unidade → 'unidade'.
  // Sessão 25/06: REVERTIDO da versão sem guarda rt≤50 (que jogava todo 'Grama(s)' pra
  // kg e despencava o sugerido dos produtos vendidos por unidade). Consistente com getDivisorRendimento.
  // CR-4: Number.isFinite — NaN cai no fallback 'unidade'.
  const rtRaw = parseFloat(produto.rendimento_total);
  const rt = Number.isFinite(rtRaw) ? rtRaw : 0;
  if (rt > 0 && rt <= 50) {
    if (un.includes('grama') || un.includes('quilo')) return 'kg';
    if (un.includes('litro') || un.includes('ml')) return 'litro';
  }

  return 'unidade';
}

// Calcula % de CMV (custo de mercadoria vendida)
// Retorna decimal (0.32 = 32%). Use formatPercent() para exibição.
export function calcCMVPercentual(custoInsumos, precoVenda) {
  const custo = _safeNum(custoInsumos);
  const preco = _safeNum(precoVenda);
  if (preco <= 0) return 0;
  return custo / preco;
}

// Calcula margem de lucro BRUTA como decimal (0.42 = 42%).
// Considera apenas o CMV (custo do produto), não inclui despesas operacionais.
// Use em telas de delivery, simulador, e onde se quer "margem do produto puro".
// Sessão 28.9 — Auditoria P1-06: função NOVA pra padronizar o cálculo de margem
// que estava espalhado inline em 20+ telas (variantes inconsistentes).
export function calcMargem(precoVenda, custoTotal) {
  const preco = _safeNum(precoVenda);
  const custo = _safeNum(custoTotal);
  if (preco <= 0) return 0;
  return (preco - custo) / preco;
}

// Calcula margem de lucro LÍQUIDA como decimal (0.18 = 18%).
// Considera CMV + despesas fixas + despesas variáveis (lucro real do dono).
// Use em telas de "margem real" do produto: Home, Produtos, Relatório, Margem Baixa.
// Sessão 28.9 — Auditoria P0-02: padroniza cálculo que estava inline em 4+ telas
// com pequenas variações (algumas com guarda contra preco=0, outras com Infinity).
export function calcMargemLiquida(precoVenda, custoTotal, despesasFixasValor, despesasVariaveisValor) {
  const preco = _safeNum(precoVenda);
  if (preco <= 0) return 0;
  const lucro = calcLucroLiquido(preco, custoTotal, despesasFixasValor, despesasVariaveisValor);
  return lucro / preco;
}

// Calcula lucro líquido em R$
// preco - custo - despesas fixas (R$) - despesas variáveis (R$)
export function calcLucroLiquido(precoVenda, custoTotal, despesasFixasValor, despesasVariaveisValor) {
  return _safeNum(precoVenda)
    - _safeNum(custoTotal)
    - _safeNum(despesasFixasValor)
    - _safeNum(despesasVariaveisValor);
}

// Normaliza string removendo acentos/diacríticos para busca
export function normalizeSearch(str) {
  // Sess\u00e3o 28.19: ANTES o NFD n\u00e3o decompunha \u00e7 (n\u00e3o tem diacr\u00edtico Unicode separado),
  // ent\u00e3o busca "acai" n\u00e3o achava "a\u00e7a\u00ed". Agora `\u00e7`/`\u00c7` viram `c`/`C` antes do NFD.
  if (str == null) return '';
  return String(str)
    .replace(/[\u00e7\u00c7]/g, (c) => (c === '\u00c7' ? 'C' : 'c'))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Arredonda pra centavos (meio pra cima, longe do zero) limpando o ruído de
 * ponto flutuante: 29.9 / 20 = 1.4949999999999999 → 1.5 (o banco devolve
 * 1.495, que toFixed(2) já levava a 1,50). Sem isso o form mostrava R$ 1,49
 * e o card R$ 1,50 para a mesma embalagem.
 */
export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const r = Math.sign(n) * Math.round(Number((Math.abs(n) * 100).toFixed(6))) / 100;
  return r === 0 ? 0 : r;
}

// Formata valor em R$
export function formatCurrency(value) {
  if (value === null || value === undefined || isNaN(value)) return 'R$ 0,00';
  const n = Number(value);
  return 'R$ ' + (Number.isFinite(n) ? roundMoney(n) : n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Formata percentual
export function formatPercent(value) {
  if (value === null || value === undefined || isNaN(value)) return '0,00%';
  return (Number(value) * 100).toFixed(2).replace('.', ',') + '%';
}

/**
 * Número pra EXIBIÇÃO em PT-BR com casas fixas: 47.7 → "47,7", 1234.5 → "1.234,5".
 * Não-finito → "0" (com as casas pedidas). Só pra texto na tela, nunca pra
 * valor que volta pro cálculo ou pro banco.
 */
export function formatNumberBR(value, decimals = 1) {
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  const [int, frac] = safe.toFixed(decimals).split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac ? `${intFmt},${frac}` : intFmt;
}

/**
 * Percentual pra EXIBIÇÃO quando o valor JÁ está em pontos percentuais
 * (47.7 → "47,7%"). Pra fração (0.477) use formatPercent.
 */
export function formatPercentBR(valuePct, decimals = 1) {
  return `${formatNumberBR(valuePct, decimals)}%`;
}

// Sessão 28.44: helpers numéricos centralizados pra remover duplicação
// (antes: 18 cópias inline de safeNum em screens/services).

/**
 * Coerce defensivo pra número finito. Aceita number, string com vírgula
 * ou ponto, null, undefined. Retorna 0 se inválido.
 * Alias semântico de parseDecimalBROrZero pra códigos pre-existentes.
 */
export function safeNum(v) {
  return parseDecimalBROrZero(v);
}

