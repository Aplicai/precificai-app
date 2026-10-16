/**
 * relatorios — contas puras das telas de Relatórios (Relatório simples,
 * Relatório de ingredientes e o PDF do relatório). Sem React, sem banco:
 * testado em __tests__/relatorios.test.mjs.
 */
import { calcMarkup, calcPrecoSugerido, formatCurrency } from './calculations';
import { isMarcaEstimada } from './insumoDisplay';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_NOMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Índice 0..11 do mês de uma linha de `faturamento_mensal`. A tabela só tem
 * `mes` (TEXT: 'Jan'..'Dez', gravado pelo Financeiro) e `valor`; não existe
 * coluna de ano. Aceita também '1'..'12'. Desconhecido → -1.
 */
export function indiceDoMes(mes) {
  const n = Number(mes);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return n - 1;
  const chave = String(mes || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().slice(0, 3);
  return MESES_CURTOS.indexOf(chave);
}

/**
 * Tendência do faturamento: compara os DOIS meses preenchidos (valor > 0)
 * mais recentes, andando para trás a partir do mês atual. Só usa o que o
 * dono digitou no Financeiro, sem projeção.
 *
 * Retorna null quando não há comparação real:
 *  - menos de 2 meses preenchidos;
 *  - todos os meses com o MESMO valor (média digitada uma vez e repetida
 *    nos 12 meses pelo Financeiro / Preço rápido: não é dado mês a mês).
 *
 * `direcao`: 'subiu' | 'desceu' | 'estavel' (variação que arredonda a 0,0%).
 */
export function calcTendenciaFaturamento(fat, hoje = new Date()) {
  const porMes = new Map();
  for (const f of fat || []) {
    const i = indiceDoMes(f?.mes);
    const v = num(f?.valor);
    if (i < 0 || v <= 0) continue;
    porMes.set(i, v);
  }
  if (porMes.size < 2) return null;
  if (new Set(porMes.values()).size < 2) return null;

  const atual = hoje.getMonth();
  const recentes = [];
  for (let k = 0; k < 12 && recentes.length < 2; k++) {
    const i = (atual - k + 12) % 12;
    if (porMes.has(i)) recentes.push(i);
  }
  const [iPara, iDe] = recentes;
  const valorDe = porMes.get(iDe);
  const valorPara = porMes.get(iPara);
  const variacaoPct = ((valorPara - valorDe) / valorDe) * 100;
  const arredondada = Math.round(variacaoPct * 10) / 10;
  const direcao = arredondada > 0 ? 'subiu' : arredondada < 0 ? 'desceu' : 'estavel';
  return {
    mesDe: MESES_NOMES[iDe],
    mesPara: MESES_NOMES[iPara],
    valorDe,
    valorPara,
    variacaoPct,
    variacaoTexto: Math.abs(arredondada).toFixed(1).replace('.', ','),
    direcao,
  };
}

/**
 * Preço sugerido de UM produto, igual ao "Preço sugerido" da tela do produto
 * (ProdutoFormScreen): markup do Financeiro (buildPricingConfig), ou o markup
 * com a margem própria do produto (`margem_lucro_produto`) quando ela existe,
 * aplicado ao custo protegido pela margem de segurança. Markup inviável → 0.
 */
export function precoSugeridoProduto(custoUnitario, produto, pricingConfig) {
  const pc = pricingConfig || {};
  const raw = produto?.margem_lucro_produto;
  const margemProduto = raw === null || raw === undefined || raw === '' ? null : Number(raw);
  const markup = margemProduto !== null && Number.isFinite(margemProduto)
    ? calcMarkup(pc.despFixasPerc, pc.despVarPerc, margemProduto)
    : num(pc.markup);
  if (!(markup > 0)) return 0;
  return calcPrecoSugerido(custoUnitario, markup, pc.margemSeguranca || 0);
}

/**
 * Mesmo critério do aviso de preços da Home/Ingredientes
 * (PrecosZeradosBanner, "N de M sem o seu preço"): valor pago vazio/zero OU
 * ainda o valor estimado pelo Kit de Início.
 */
export function semPrecoDoDono(insumo) {
  const v = insumo?.valor_pago;
  return v == null || Number(v) === 0 || isMarcaEstimada(insumo?.marca);
}

/**
 * Separa os ingredientes com preço em:
 *  - desatualizados: última atualização registrada há mais de `limiteDias`;
 *  - semHistorico: nenhum registro em historico_precos (não dá pra saber a idade).
 * `historico` = linhas de historico_precos ({ materia_prima_id, data }).
 */
export function classificarIdadePrecos(insumos, historico, now = Date.now(), limiteDias = 60) {
  const dia = 24 * 60 * 60 * 1000;
  const ultima = {};
  for (const h of historico || []) {
    const ts = h?.data || h?.created_at;
    if (!ts || h?.materia_prima_id == null) continue;
    const t = new Date(ts).getTime();
    if (!Number.isFinite(t)) continue;
    const cur = ultima[h.materia_prima_id];
    if (!cur || t > cur) ultima[h.materia_prima_id] = t;
  }
  const desatualizados = [];
  const semHistorico = [];
  for (const i of insumos || []) {
    const t = ultima[i.id];
    if (!t) { semHistorico.push(i); continue; }
    const idadeDias = (now - t) / dia;
    if (idadeDias > limiteDias) desatualizados.push({ ...i, idadeDias });
  }
  desatualizados.sort((a, b) => b.idadeDias - a.idadeDias);
  return { desatualizados, semHistorico };
}

/**
 * Faixa de preço por categoria (média/mín/máx de preco_por_kg) dos itens com
 * preço do dono. Categorias sem nenhum item com preço ficam de fora.
 */
export function statsPorCategoria(insumos) {
  const byCat = {};
  for (const m of insumos || []) {
    if (isMarcaEstimada(m.marca)) continue;
    const preco = num(m.preco_por_kg);
    if (preco <= 0) continue;
    const cat = m.categoria_nome || 'Sem categoria';
    if (!byCat[cat]) byCat[cat] = { nome: cat, items: [], total: 0, count: 0 };
    byCat[cat].items.push({ nome: m.nome, marca: m.marca, preco, unidade: m.unidade_medida });
    byCat[cat].total += preco;
    byCat[cat].count += 1;
  }
  return Object.values(byCat).map((c) => ({
    ...c,
    media: c.total / c.count,
    max: Math.max(...c.items.map((i) => i.preco)),
    min: Math.min(...c.items.map((i) => i.preco)),
  })).sort((a, b) => b.count - a.count);
}

/**
 * Produtos do card "Atenção!": margem abaixo de `limite` (10%), INCLUINDO
 * margem negativa (vende no prejuízo). Ordem: pior margem primeiro, então
 * quem dá prejuízo aparece no topo.
 */
export function selecionarAtencao(produtos, limite = 0.10) {
  return (produtos || [])
    .filter((p) => Number.isFinite(Number(p?.margem)) && Number(p.margem) < limite)
    .sort((a, b) => Number(a.margem) - Number(b.margem));
}

/** Prejuízo por venda: lucro líquido por unidade abaixo de meio centavo negativo. */
export function vendeNoPrejuizo(p) {
  return num(p?.lucro) < -0.005;
}

/** Só sugere aumentar quando o preço sugerido é maior que o preço atual. */
export function deveSugerirAumento(p) {
  return num(p?.precoSugerido) > 0 && num(p.precoSugerido) > num(p?.precoVenda) + 0.005;
}

/** Frase do "Atenção!" (PDF): prejuízo primeiro, depois margem apertada. */
export function textoAtencao(p) {
  const base = vendeNoPrejuizo(p)
    ? `${p.nome}: você perde ${formatCurrency(Math.abs(num(p.lucro)))} a cada venda.`
    : `${p.nome} está te custando quase o que você cobra.`;
  return deveSugerirAumento(p)
    ? `${base} O preço sugerido é ${formatCurrency(p.precoSugerido)} (hoje: ${formatCurrency(p.precoVenda)}).`
    : `${base} Revise os custos e o preço desse produto.`;
}

/**
 * Troca o custo/kg das linhas de produto_preparos (com `preparo_id`) pelo
 * custo atual das receitas base (Map de sincronizarCustosPreparos), como faz
 * a tela do produto. Sem Map (sincronização falhou) → linhas como vieram.
 */
export function aplicarCustoAtualPreparos(linhas, custos) {
  if (!custos || typeof custos.get !== 'function') return linhas || [];
  return (linhas || []).map((l) => {
    const c = custos.get(l.preparo_id);
    return c ? { ...l, custo_por_kg: c.custo_por_kg } : l;
  });
}
