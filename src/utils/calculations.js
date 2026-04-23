import { getDatabase } from '../database/database';

// ========== MARGEM DE SEGURANÇA ==========

// Retorna a margem de segurança como decimal (ex: 0.05 para 5%)
export async function getMargemSeguranca() {
  const db = await getDatabase();
  const configs = await db.getAllAsync('SELECT margem_seguranca FROM configuracao');
  return configs?.[0]?.margem_seguranca || 0;
}

// Aplica margem de segurança a um custo base
export function aplicarMargemSeguranca(custo, margemDecimal) {
  if (!margemDecimal || margemDecimal <= 0) return custo;
  return custo * (1 + margemDecimal);
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

// Calcula o preço por unidade base (Kg, Litro ou Unidade)
// valorPago: quanto pagou pelo produto
// quantidadeLiquida: quantidade aproveitável na unidade original
// unidade: unidade de medida selecionada
export function calcPrecoBase(valorPago, quantidadeLiquida, unidade) {
  if (!quantidadeLiquida || quantidadeLiquida === 0) return 0;
  const tipo = getTipoUnidade(unidade);
  const qtBaseGramas = converterParaBase(quantidadeLiquida, unidade);
  if (tipo === 'unidade') {
    return valorPago / quantidadeLiquida;
  }
  // Para peso e volume: preço por 1000 unidades base (= 1kg ou 1L)
  if (qtBaseGramas === 0) return 0;
  return (valorPago / qtBaseGramas) * 1000;
}

// Mantém compatibilidade com código existente
export function calcPrecoKg(valorPago, quantidadeLiquida, unidade) {
  return calcPrecoBase(valorPago, quantidadeLiquida, unidade || 'g');
}

// Calcula o fator de correção
export function calcFatorCorrecao(quantidadeBruta, quantidadeLiquida) {
  if (!quantidadeBruta || quantidadeBruta === 0) return 1;
  return quantidadeLiquida / quantidadeBruta;
}

// Calcula preço unitário da embalagem
export function calcPrecoUnitarioEmbalagem(precoEmbalagem, quantidade) {
  if (!quantidade || quantidade === 0) return 0;
  return precoEmbalagem / quantidade;
}

// Calcula o custo de um ingrediente no produto
// precoBase: preço por kg, litro ou unidade
// quantidadeUtilizada: quantidade na unidade informada
// unidadeIngrediente: unidade do ingrediente cadastrado
// unidadeUso: unidade em que a quantidade foi informada no produto
export function calcCustoIngrediente(precoBase, quantidadeUtilizada, unidadeIngrediente, unidadeUso) {
  const tipo = getTipoUnidade(unidadeIngrediente || 'g');
  if (tipo === 'unidade') {
    return precoBase * quantidadeUtilizada;
  }
  // Converter quantidade usada para base (g ou mL)
  const qtBase = converterParaBase(quantidadeUtilizada, unidadeUso || unidadeIngrediente || 'g');
  // precoBase é por 1000 unidades base (1kg ou 1L)
  return (qtBase / 1000) * precoBase;
}

// Calcula o custo de um preparo no produto
export function calcCustoPreparo(custoKgPreparo, quantidadeUtilizada, unidadeUso) {
  const qtBase = converterParaBase(quantidadeUtilizada, unidadeUso || 'g');
  return (qtBase / 1000) * custoKgPreparo;
}

// Calcula o custo de uma embalagem no produto
export function calcCustoEmbalagem(precoUnitario, quantidadeUtilizada) {
  return precoUnitario * quantidadeUtilizada;
}

// Calcula o total de despesas fixas como percentual do faturamento
export function calcDespesasFixasPercentual(totalDespesasFixas, faturamentoMedio) {
  if (!faturamentoMedio || faturamentoMedio === 0) return 0;
  return totalDespesasFixas / faturamentoMedio;
}

// Calcula o Mark-up
export function calcMarkup(despesasFixasPerc, despesasVariaveisPerc, lucroDesejado) {
  const denominador = despesasFixasPerc + despesasVariaveisPerc + lucroDesejado;
  if (denominador >= 1) return 0;
  return 1 / (1 - denominador);
}

// Calcula preço sugerido via mark-up
export function calcPrecoSugerido(custoTotal, markup) {
  return custoTotal * markup;
}

// Calcula o custo unitário do produto
export function calcCustoUnitario(custoTotal, rendimentoUnidades) {
  if (!rendimentoUnidades || rendimentoUnidades === 0) return custoTotal;
  return custoTotal / rendimentoUnidades;
}

// Determina o divisor correto para o custo unitário de um produto
// Produtos vendidos por kg/litro usam rendimento_total; por unidade usam rendimento_unidades
// Suporta valores novos ('por_kg', 'por_litro') E legados ('Grama(s)', 'Mililitro(s)').
// Heurística legado: se unidade_rendimento contém 'grama'/'quilo'/'litro'/'ml'
// E rendimento_total é pequeno (≤50), o produto foi cadastrado como "Por kg/litro".
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

// Calcula % de CMV
export function calcCMVPercentual(custoInsumos, precoVenda) {
  if (!precoVenda || precoVenda === 0) return 0;
  return custoInsumos / precoVenda;
}

// Calcula lucro líquido em R$
export function calcLucroLiquido(precoVenda, custoTotal, despesasFixasValor, despesasVariaveisValor) {
  return precoVenda - custoTotal - despesasFixasValor - despesasVariaveisValor;
}

// Classifica o produto na Engenharia de Cardápio
export function classificarBCG(participacaoMercado, crescimentoVendas) {
  const altaParticipacao = participacaoMercado >= 50;
  const altoCrescimento = crescimentoVendas >= 50;

  if (altaParticipacao && altoCrescimento) return { nome: 'Estrela', cor: '#FFD700', emoji: '⭐' };
  if (altaParticipacao && !altoCrescimento) return { nome: 'Vaca Leiteira', cor: '#4CAF50', emoji: '🐄' };
  if (!altaParticipacao && altoCrescimento) return { nome: 'Interrogação', cor: '#2196F3', emoji: '❓' };
  return { nome: 'Abacaxi', cor: '#F44336', emoji: '🍍' };
}

// Normaliza string removendo acentos/diacríticos para busca
export function normalizeSearch(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
