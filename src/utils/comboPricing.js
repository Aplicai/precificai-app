/**
 * Fórmulas puras da tela de Combos/Kits (`src/screens/DeliveryCombosScreen.js`).
 *
 * Extraído na auditoria de Combos (sessão 2026-09-09) pra:
 *   1) permitir teste unitário isolado das contas (sem DB/React Native);
 *   2) consertar uma inconsistência de unidade de medida que existia entre
 *      "adicionar item" (usava a unidade NATIVA do item nos dois lados da
 *      conversão) e "carregar/reabrir combo" (usava 'g' fixo nos dois lados),
 *      fazendo o custo de ingredientes/receitas base medidos em kg, L ou un
 *      mudar drasticamente entre o momento de adicionar e o de recarregar.
 *
 * Convenções (mesmas do resto do app — ver `calculations.js`):
 *   - percentuais são decimais (0.15 = 15%), sempre sobre o preço de venda;
 *   - `custoUnit` = custo de 1 unidade NATIVA do item (kg, L, un, g conforme
 *     o cadastro), nunca "por grama" a menos que a unidade nativa seja grama.
 */
import { calcCustoIngrediente, calcCustoPreparo, getTipoVenda, safeNum } from './calculations';

/**
 * Custo de 1 unidade NATIVA de um item do combo, dado o tipo e o registro
 * carregado do banco. Mesma lógica pra "adicionar item", "carregar lista de
 * combos" e "reabrir combo pra editar" — antes cada um desses 3 lugares
 * calculava esse número de um jeito diferente (bug de unidade).
 *
 * @param {'produto'|'delivery_produto'|'materia_prima'|'embalagem'|'preparo'} tipo
 * @param {object} dados - registro do item:
 *   - produto/delivery_produto: { custoUnitario, unidade_rendimento, rendimento_total } —
 *     custoUnitario já inclui embalagem do produto (calculado em loadData); NÃO somar
 *     embalagem de novo. `unidade_rendimento`/`rendimento_total` vêm direto da linha do
 *     produto e definem se ele é vendido por kg/litro/unidade (ver `getTipoVenda`).
 *   - materia_prima: { preco_por_kg, unidade_medida }
 *   - embalagem: { preco_unitario }
 *   - preparo: { custo_por_kg, unidade_medida }
 * @returns {{ custo: number, unidade: string }}
 */
export function resolveCustoUnitarioItemCombo(tipo, dados) {
  const item = dados || {};
  if (tipo === 'produto' || tipo === 'delivery_produto') {
    // Bug real: o código original lia `item.tipo_venda`, um campo que não existe
    // na tabela produtos/delivery_produtos (o campo certo é `unidade_rendimento`,
    // interpretado por `getTipoVenda`) — a badge de unidade do produto no combo
    // sempre caía em "un", mesmo pra produto vendido por kg ou litro.
    const tv = getTipoVenda(item);
    const unidade = tv === 'kg' ? 'kg' : tv === 'litro' ? 'L' : 'un';
    return { custo: safeNum(item.custoUnitario), unidade };
  }
  if (tipo === 'materia_prima') {
    const u = item.unidade_medida || 'g';
    // Custo de 1 unidade NATIVA (ex: 1 kg de farinha) — mesma unidade nos dois
    // argumentos de conversão, nunca fixar 'g' quando o insumo é kg/L/un.
    return { custo: calcCustoIngrediente(item.preco_por_kg || 0, 1, u, u), unidade: u };
  }
  if (tipo === 'embalagem') {
    return { custo: safeNum(item.preco_unitario), unidade: 'un' };
  }
  if (tipo === 'preparo') {
    const u = item.unidade_medida || 'g';
    return { custo: calcCustoPreparo(item.custo_por_kg || 0, 1, u), unidade: u };
  }
  return { custo: 0, unidade: 'un' };
}

/** Custo de `quantidade` unidades nativas do item (custoUnit × qtd). */
export function calcCustoItemComboPorQuantidade(tipo, dados, quantidade) {
  const { custo } = resolveCustoUnitarioItemCombo(tipo, dados);
  return custo * (safeNum(quantidade) || 0);
}

/**
 * Custo total do combo: soma de custoUnit × quantidade de cada item já resolvido.
 * @param {Array<{custoUnit:number, quantidade:number|string}>} itens
 */
export function calcCustoTotalCombo(itens) {
  return (itens || []).reduce((acc, it) => acc + safeNum(it.custoUnit) * safeNum(it.quantidade), 0);
}

/**
 * Lucro líquido do combo em R$: preço − custo − preço×(fixo% + variável%).
 * Mesma fórmula usada em `precificacao.js` (calcularPrecoCombo) pro preço
 * sugerido — antes o card da lista mostrava "Lucro Líquido"/"Margem Líq."
 * mas calculava só `preço − custo` (margem BRUTA), sem descontar despesas
 * fixas/variáveis, o que inflava o lucro exibido.
 */
export function calcLucroLiquidoCombo(precoVenda, custoTotal, fixoPerc = 0, variavelPerc = 0) {
  const preco = safeNum(precoVenda);
  const custo = safeNum(custoTotal);
  const fx = Math.max(0, safeNum(fixoPerc));
  const vr = Math.max(0, safeNum(variavelPerc));
  return preco - custo - preco * (fx + vr);
}

/** Margem líquida do combo como decimal (0.18 = 18%). Guarda preço<=0 → 0. */
export function calcMargemLiquidaCombo(precoVenda, custoTotal, fixoPerc = 0, variavelPerc = 0) {
  const preco = safeNum(precoVenda);
  if (preco <= 0) return 0;
  return calcLucroLiquidoCombo(preco, custoTotal, fixoPerc, variavelPerc) / preco;
}

/**
 * Soma do preço de venda "avulso" dos itens do combo que são produtos
 * (produto/delivery_produto) com preço de venda cadastrado > 0. Ingredientes,
 * receitas base e embalagens não têm preço de venda avulso pra comparar —
 * não entram na conta de economia.
 * @param {Array<{tipo:string, precoVendaAvulso:number, quantidade:number|string}>} itens
 */
export function calcSomaPrecoAvulsoProdutos(itens) {
  return (itens || [])
    .filter((it) => (it.tipo === 'produto' || it.tipo === 'delivery_produto') && safeNum(it.precoVendaAvulso) > 0)
    .reduce((acc, it) => acc + safeNum(it.precoVendaAvulso) * (safeNum(it.quantidade) || 1), 0);
}

/**
 * Economia do cliente ao comprar o combo em vez dos produtos separados:
 * (soma dos preços de venda avulsos dos produtos do combo) − (preço do combo).
 * Retorna 0/0 quando não há produtos com preço avulso pra comparar (ex: combo
 * só de ingredientes/embalagens) — nesse caso a UI não deve exibir a linha de economia.
 * @returns {{ valor: number, percentual: number }}
 */
export function calcEconomiaCombo(somaPrecoAvulsoProdutos, precoCombo) {
  const soma = safeNum(somaPrecoAvulsoProdutos);
  const preco = safeNum(precoCombo);
  if (soma <= 0) return { valor: 0, percentual: 0 };
  const valor = soma - preco;
  return { valor, percentual: valor / soma };
}
