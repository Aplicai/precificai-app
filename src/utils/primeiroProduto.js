/**
 * Primeiro acesso guiado: "Qual produto você mais vende?" → ingredientes →
 * preço (15/10/2026). Substitui o Kit de Início no primeiro acesso: de 43
 * cadastros, os que pegaram o Kit viam ~90 ingredientes sem preço e saíam;
 * só 1 chegou a um produto com preço.
 *
 * Funções puras (sem React/RN) para rodar em `npm test`. Os cálculos são os
 * mesmos do formulário de ingrediente e do formulário de produto:
 *   - preço por kg/L/un: calcPrecoBase (MateriaPrimaFormScreen)
 *   - custo na receita: calcCustoIngrediente
 *   - divisor do rendimento: getDivisorRendimento
 *   - preço sugerido: mesma fórmula do EntityCreateModal (linhas ~1580-1600)
 *
 * UNIDADE: produto_ingredientes.quantidade_utilizada fica na UNIDADE DO
 * INGREDIENTE (todas as telas leem com calcCustoIngrediente(pb, qtd, un, un)).
 * "Comprei 5 kg, uso 300 g" grava 0,3. Gravar 300 deixaria o custo 1000×.
 */
import {
  parseDecimalBR, calcPrecoBase, calcCustoIngrediente, converterParaBase,
  converterDeBase, getTipoUnidade, calcMarkup, calcPrecoSugerido,
  getDivisorRendimento, normalizeSearch,
} from './calculations';
import { fraseCustoResultado } from './compraSentence';
import { resolverPrecoAoSalvar } from './precoAoSalvar';
import { INSUMOS_POR_SEGMENTO } from '../data/templates';

export const MAX_LINHAS = 6;
export const LINHAS_INICIAIS = 3;
/** Mesmo padrão do formulário de produto quando o Financeiro não tem lucro. */
export const MARGEM_ALVO_DEFAULT = 0.15;

const CATEGORIAS_FORA = /embalage|descart|limpeza/i;

// Ordem importa: o primeiro tema citado no texto vence ("Doces e salgados" →
// confeitaria). Cada palavra-chave casa no INÍCIO de uma palavra.
const SEGMENTO_PALAVRAS = [
  ['confeitaria', ['doce', 'bolo', 'brigadeir', 'torta', 'confeit', 'bombo', 'brownie', 'cupcake', 'pudim', 'trufa', 'sobremesa']],
  ['pizzaria', ['pizza', 'esfiha', 'esfirra', 'calzone']],
  ['japonesa', ['sushi', 'temaki', 'japon', 'oriental', 'poke', 'yakisoba']],
  ['acai', ['acai', 'smoothie']],
  ['sorveteria', ['sorvet', 'picole', 'gelato', 'geladinho']],
  ['salgaderia', ['salgad', 'coxinha', 'pastel', 'empada', 'espetinho', 'esfirr']],
  ['hamburgueria', ['hamburg', 'burger', 'burguer', 'lanche', 'lanchonete', 'hot dog', 'cachorro']],
  ['padaria', ['padaria', 'pao', 'paes', 'panific']],
  ['cafeteria', ['cafe', 'cafeteria', 'coffee']],
  ['marmitaria', ['marmit', 'quentinha', 'congelad', 'fit']],
  ['restaurante', ['restaurante', 'massa', 'macarr', 'lasanha', 'comida', 'prato', 'buffet', 'self']],
];

/** Texto livre do perfil ("Doces da Maria") → chave do template ou null. */
export function segmentoKeyDoTexto(texto) {
  const t = normalizeSearch(texto || '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const palavras = ` ${t}`;
  let melhor = null;
  for (const [key, chaves] of SEGMENTO_PALAVRAS) {
    for (const c of chaves) {
      const pos = palavras.indexOf(` ${c}`);
      if (pos >= 0 && (melhor === null || pos < melhor.pos)) melhor = { key, pos };
    }
  }
  return melhor ? melhor.key : null;
}

function ingredientesDoTemplate(lista) {
  return (lista || []).filter((i) => !CATEGORIAS_FORA.test(i.categoria || ''));
}

/**
 * Ingredientes sugeridos para o segmento. Sem segmento: os mais comuns entre
 * todos os segmentos (quantos segmentos têm aquele nome).
 */
export function sugestoesIngredientes(segKey, limite = 60) {
  const vistos = new Set();
  const out = [];
  const add = (i) => {
    const k = normalizeSearch(i.nome);
    if (vistos.has(k)) return;
    vistos.add(k);
    out.push(i);
  };
  if (segKey && INSUMOS_POR_SEGMENTO[segKey]) {
    ingredientesDoTemplate(INSUMOS_POR_SEGMENTO[segKey]).forEach(add);
  } else {
    const contagem = new Map();
    for (const lista of Object.values(INSUMOS_POR_SEGMENTO)) {
      for (const i of ingredientesDoTemplate(lista)) {
        const k = normalizeSearch(i.nome);
        const atual = contagem.get(k);
        contagem.set(k, { item: atual ? atual.item : i, n: (atual ? atual.n : 0) + 1 });
      }
    }
    [...contagem.values()].sort((a, b) => b.n - a.n).forEach((c) => add(c.item));
  }
  return out.slice(0, limite);
}

/** Sugestões que combinam com o que a pessoa digitou (sem acento, sem as já usadas). */
export function filtrarSugestoes(lista, termo, nomesUsados = [], max = 6) {
  const t = normalizeSearch(termo || '').trim();
  if (!t) return [];
  const usados = new Set((nomesUsados || []).map((n) => normalizeSearch(n || '').trim()));
  return (lista || [])
    .filter((s) => {
      const n = normalizeSearch(s.nome);
      return n.includes(t) && !usados.has(n) && n !== t;
    })
    .slice(0, max);
}

// Chips do passo 1. Nomes simples, sem tamanho nem embalagem: os do Kit
// ("Brigadeiro Gourmet caixa 12 un", "Bolo de Chocolate 1kg") brigavam com
// "Essa receita rende", logo abaixo.
const PRODUTOS_SUGERIDOS = {
  confeitaria: ['Bolo de chocolate', 'Brigadeiro', 'Bolo de pote', 'Brownie', 'Torta de limão', 'Cupcake'],
  padaria: ['Pão francês', 'Pão de queijo', 'Bolo caseiro', 'Sonho', 'Rosca doce', 'Pão de forma'],
  hamburgueria: ['Hambúrguer artesanal', 'X-salada', 'X-bacon', 'Batata frita', 'Hot dog', 'Milkshake'],
  pizzaria: ['Pizza de calabresa', 'Pizza de mussarela', 'Pizza de frango com catupiry', 'Esfiha', 'Calzone', 'Pizza doce'],
  restaurante: ['Prato feito', 'Lasanha', 'Macarrão à bolonhesa', 'Strogonoff', 'Feijoada', 'Parmegiana'],
  marmitaria: ['Marmita de frango', 'Marmita fit', 'Marmita de carne', 'Feijoada', 'Strogonoff', 'Marmita congelada'],
  acai: ['Açaí na tigela', 'Açaí no copo', 'Smoothie', 'Creme de cupuaçu', 'Bowl de frutas', 'Creme de ninho'],
  cafeteria: ['Café coado', 'Cappuccino', 'Pão de queijo', 'Bolo de cenoura', 'Croissant', 'Misto quente'],
  sorveteria: ['Sorvete de massa', 'Picolé', 'Milkshake', 'Sundae', 'Geladinho', 'Taça de sorvete'],
  salgaderia: ['Coxinha', 'Pastel', 'Empada', 'Kibe', 'Esfiha', 'Espetinho'],
  japonesa: ['Temaki', 'Hot roll', 'Sushi', 'Uramaki', 'Yakisoba', 'Poke'],
};
const PRODUTOS_GERAIS = ['Bolo de chocolate', 'Brigadeiro', 'Marmita', 'Hambúrguer', 'Pizza', 'Coxinha'];

/** Nomes de produto para os chips do passo 1 (gerais quando não sabemos o segmento). */
export function sugestoesProduto(segKey) {
  return PRODUTOS_SUGERIDOS[segKey] || PRODUTOS_GERAIS;
}

function numBR(n) {
  return String(Math.round(n * 1000) / 1000).replace('.', ',');
}

/** Quantidade do template → frase de compra ("1000 g" vira "1 kg"). Preço fica vazio. */
export function prefillCompraDeTemplate(t) {
  const q = Number(t?.quantidade_bruta) || 0;
  const un = t?.unidade_medida || 'kg';
  if (un === 'g' && q >= 1000) return { qtdCompra: numBR(q / 1000), unCompra: 'kg' };
  if (un === 'mL' && q >= 1000) return { qtdCompra: numBR(q / 1000), unCompra: 'L' };
  return { qtdCompra: q > 0 ? numBR(q) : '', unCompra: un };
}

/** Unidades em que dá para dizer "uso X na receita", conforme a unidade da compra. */
export function unidadesUsoPara(unCompra) {
  const tipo = getTipoUnidade(unCompra);
  if (tipo === 'peso') return ['g', 'kg'];
  if (tipo === 'volume') return ['mL', 'L'];
  return ['un'];
}

export function unidadeUsoPadrao(unCompra) {
  return unidadesUsoPara(unCompra)[0];
}

export function linhaVazia() {
  return { nome: '', qtdCompra: '', unCompra: 'kg', valor: '', qtdUso: '', unUso: 'g' };
}

function positivo(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = parseDecimalBR(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Uma linha de ingrediente → status e números.
 * status: 'vazia' (nada preenchido) | 'incompleta' | 'valida'.
 */
export function calcularLinha(l) {
  const nome = String(l?.nome || '').trim();
  const qtdCompra = positivo(l?.qtdCompra);
  const valor = positivo(l?.valor);
  const qtdUso = positivo(l?.qtdUso);
  const unCompra = l?.unCompra || 'kg';
  const unUso = unidadesUsoPara(unCompra).includes(l?.unUso) ? l.unUso : unidadeUsoPadrao(unCompra);

  const vazia = !nome && qtdCompra === null && valor === null && qtdUso === null;
  if (vazia) return { status: 'vazia', erros: {}, precoBase: 0, fraseCusto: '', custoNaReceita: 0, qtdNaUnidadeDoInsumo: 0 };

  const erros = {};
  if (!nome) erros.nome = 'Diga o nome do ingrediente';
  if (!qtdCompra) erros.qtdCompra = 'Diga quanto você comprou';
  if (!valor) erros.valor = 'Diga quanto pagou';
  if (!qtdUso) erros.qtdUso = 'Diga quanto vai na receita';

  const precoBase = qtdCompra && valor ? calcPrecoBase(valor, qtdCompra, unCompra) : 0;
  const custoNaReceita = precoBase > 0 && qtdUso ? calcCustoIngrediente(precoBase, qtdUso, unCompra, unUso) : 0;
  const qtdNaUnidadeDoInsumo = qtdUso
    ? (getTipoUnidade(unCompra) === 'unidade' ? qtdUso : converterDeBase(converterParaBase(qtdUso, unUso), unCompra))
    : 0;

  return {
    status: Object.keys(erros).length ? 'incompleta' : 'valida',
    erros,
    precoBase,
    fraseCusto: fraseCustoResultado(precoBase, unCompra),
    custoNaReceita,
    qtdNaUnidadeDoInsumo,
  };
}

/** Nomes repetidos (normalizados) entre as linhas preenchidas. */
export function nomesDuplicados(linhas) {
  const vistos = new Set();
  const dup = new Set();
  for (const l of linhas || []) {
    const n = normalizeSearch(String(l?.nome || '').trim());
    if (!n) continue;
    if (vistos.has(n)) dup.add(n);
    vistos.add(n);
  }
  return [...dup];
}

/**
 * Preço sugerido com a MESMA regra do formulário de produto: com Financeiro,
 * o markup dele; sem Financeiro, markup com custos fixos = 0 e lucro alvo
 * (padrão 15%). pricingConfig nulo = conta sem Financeiro.
 */
export function calcPrecoSugeridoProduto(cmvUnitario, pricingConfig) {
  const pc = pricingConfig || { despFixasPerc: 0, despVarPerc: 0, lucroDesejado: 0, markup: 0, margemSeguranca: 0 };
  const temFinanceiro = pc.despFixasPerc > 0;
  const lucro = pc.lucroDesejado > 0 ? pc.lucroDesejado : MARGEM_ALVO_DEFAULT;
  const markup = pc.markup > 0 ? pc.markup : calcMarkup(0, pc.despVarPerc, lucro);
  const preco = markup > 0 ? calcPrecoSugerido(cmvUnitario, markup, pc.margemSeguranca || 0) : 0;
  return { preco, markup, temFinanceiro, semFixos: preco > 0 && !temFinanceiro };
}

const TIPO_RENDIMENTO = { unidade: 'por_unidade', kg: 'por_kg', litro: 'por_litro' };

/**
 * "Essa receita rende [N] [unidades|kg|litros]" → colunas do produto, igual
 * ao formulário: por unidade → total 1 e N unidades; por kg/L → total N.
 */
export function camposRendimento(tipo, qtd) {
  const n = positivo(qtd);
  if (!n || !TIPO_RENDIMENTO[tipo]) return null;
  if (tipo === 'unidade') return { unidade_rendimento: 'por_unidade', rendimento_total: 1, rendimento_unidades: n };
  return { unidade_rendimento: TIPO_RENDIMENTO[tipo], rendimento_total: n, rendimento_unidades: 1 };
}

/** Custo da receita, custo por unidade vendida, sugerido e o que impede salvar. */
export function resumoReceita(linhas, rendimento, pricingConfig) {
  const calc = (linhas || []).map(calcularLinha);
  const validas = calc.filter((c) => c.status === 'valida');
  const custoTotal = validas.reduce((a, c) => a + c.custoNaReceita, 0);
  const rend = camposRendimento(rendimento?.tipo, rendimento?.qtd);
  const divisor = rend ? getDivisorRendimento(rend) : 0;
  const cmvUnitario = divisor > 0 ? custoTotal / divisor : 0;
  const sug = calcPrecoSugeridoProduto(cmvUnitario, pricingConfig);

  const bloqueios = [];
  if (!rend) bloqueios.push('Diga quanto a receita rende');
  if (calc.some((c) => c.status === 'incompleta')) bloqueios.push('Complete ou apague o ingrediente pela metade');
  const dup = nomesDuplicados(linhas);
  if (dup.length) bloqueios.push('Tem ingrediente repetido na receita');
  if (validas.length === 0) bloqueios.push('Adicione pelo menos 1 ingrediente');

  return {
    custoTotal,
    cmvUnitario,
    precoSugerido: sug.preco,
    semFixos: sug.semFixos,
    temFinanceiro: sug.temFinanceiro,
    linhasValidas: validas.length,
    bloqueios,
  };
}

/**
 * Tudo que será gravado: linhas de materias_primas (mesmas colunas do
 * formulário de ingrediente), o produto e a quantidade de cada ingrediente
 * na unidade do ingrediente, mais o preço final (digitado > sugerido).
 */
export function montarPayloadPrimeiroProduto({ nome, rendimento, linhas }, pricingConfig, precoDigitado) {
  const resumo = resumoReceita(linhas, rendimento, pricingConfig);
  const materias = [];
  const quantidades = [];
  for (const l of linhas || []) {
    const c = calcularLinha(l);
    if (c.status !== 'valida') continue;
    const qtd = parseDecimalBR(l.qtdCompra);
    materias.push({
      nome: String(l.nome).trim(),
      marca: '',
      categoria_id: null,
      quantidade_bruta: qtd,
      quantidade_liquida: qtd,
      fator_correcao: 1,
      unidade_medida: l.unCompra,
      valor_pago: parseDecimalBR(l.valor),
      preco_por_kg: c.precoBase,
    });
    quantidades.push(c.qtdNaUnidadeDoInsumo);
  }
  const dig = parseDecimalBR(precoDigitado);
  return {
    produto: { nome: String(nome || '').trim(), ...camposRendimento(rendimento?.tipo, rendimento?.qtd) },
    materias,
    quantidades,
    preco: resolverPrecoAoSalvar(Number.isFinite(dig) ? dig : 0, resumo.precoSugerido),
    resumo,
  };
}
