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
export function converterParaBase(valor, unidade) {
  const un = UNIDADES_MEDIDA.find(u => u.value === unidade);
  if (!un) return valor;
  return valor * un.fatorBase;
}

// Converte da unidade base para a unidade desejada
export function converterDeBase(valorBase, unidade) {
  const un = UNIDADES_MEDIDA.find(u => u.value === unidade);
  if (!un || un.fatorBase === 0) return valorBase;
  return valorBase / un.fatorBase;
}

// Retorna o tipo da unidade (peso, volume, unidade)
export function getTipoUnidade(unidade) {
  const un = UNIDADES_MEDIDA.find(u => u.value === unidade);
  return un ? un.tipo : 'peso';
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
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
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

// Calcula preço sugerido via mark-up
export function calcPrecoSugerido(custoTotal, markup) {
  return _safeNum(custoTotal) * _safeNum(markup);
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

  // Heurística para valores legados: Grama(s)/Mililitro(s) com rt pequeno = venda por kg/litro
  // CR-4: Number.isFinite — NaN deve cair no fallback `unidade` (não causar Infinity no CMV)
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

  // Heurística para valores legados
  // CR-4: Number.isFinite — NaN deve cair no fallback 'unidade' (não classificar errado)
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

// Formata valor em R$
export function formatCurrency(value) {
  if (value === null || value === undefined || isNaN(value)) return 'R$ 0,00';
  return 'R$ ' + Number(value).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Formata percentual
export function formatPercent(value) {
  if (value === null || value === undefined || isNaN(value)) return '0,00%';
  return (Number(value) * 100).toFixed(2).replace('.', ',') + '%';
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

