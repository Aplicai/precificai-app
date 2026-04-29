/**
 * cascadeRecalc — APP-08, 09, 10, 23
 *
 * Quando um insumo tem o preço atualizado, a mudança precisa propagar:
 *   insumo  →  preparo  →  produto  →  combo  →  delivery_produto
 *
 * Hoje a app não faz cascade automático: a testadora atualizou o preço
 * do ovo nos insumos, abriu o preparo "massa de bolo branca" e o valor
 * do ovo NÃO atualizou. Já a farinha atualizou — comportamento
 * inconsistente que confunde o usuário.
 *
 * Estratégia escolhida (compromisso entre simplicidade e correção):
 *   - Não fazer cascade automático recalculando tudo a cada UPDATE (caro
 *     e perigoso se houver bug).
 *   - Em vez disso: recalcular sob demanda quando o usuário abre uma
 *     tela que mostra preços agregados (preparos, produtos, combos).
 *   - Adicionar funções utilitárias `recalcularPreparo`, `recalcularProduto`
 *     e `recalcularCombo` chamadas pela cada tela ao montar.
 *
 * Isso garante que o usuário sempre vê o valor mais recente, mesmo que
 * o cache de `custo_por_kg` (preparo) ou `custo` (combo) esteja stale.
 */

import { calcCustoIngrediente, calcCustoPreparo, getDivisorRendimento } from '../utils/calculations';

const safe = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Recalcula `custo_por_kg` de um preparo a partir dos insumos atuais.
 * Persiste no DB.
 */
export async function recalcularPreparo(db, preparoId) {
  const p = await db.getFirstAsync('SELECT * FROM preparos WHERE id = ?', [preparoId]);
  if (!p) return null;
  const ings = await db.getAllAsync(
    'SELECT pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM preparo_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id WHERE pi.preparo_id = ?',
    [preparoId]
  );
  const custoTotal = (ings || []).reduce((a, i) => a + calcCustoIngrediente(i.preco_por_kg, i.quantidade_utilizada, i.unidade_medida, i.unidade_medida), 0);
  const rendimento = safe(p.rendimento_total);
  const custoPorKg = rendimento > 0 ? custoTotal / rendimento : custoTotal;
  await db.runAsync('UPDATE preparos SET custo_por_kg = ? WHERE id = ?', [custoPorKg, preparoId]);
  return { id: preparoId, custoTotal, custoPorKg };
}

/**
 * Recalcula custo total e custo unitário de um produto a partir dos
 * insumos + preparos + embalagens atuais. NÃO persiste preço de venda.
 */
export async function recalcularProduto(db, produtoId) {
  const prod = await db.getFirstAsync('SELECT * FROM produtos WHERE id = ?', [produtoId]);
  if (!prod) return null;

  const [ings, preps, embs] = await Promise.all([
    db.getAllAsync(
      'SELECT pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id WHERE pi.produto_id = ?',
      [produtoId]
    ),
    db.getAllAsync(
      'SELECT pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id WHERE pp.produto_id = ?',
      [produtoId]
    ),
    db.getAllAsync(
      'SELECT pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id WHERE pe.produto_id = ?',
      [produtoId]
    ),
  ]);

  const custoIng = (ings || []).reduce((a, i) => a + calcCustoIngrediente(i.preco_por_kg, i.quantidade_utilizada, i.unidade_medida, i.unidade_medida), 0);
  const custoPr = (preps || []).reduce((a, pp) => a + calcCustoPreparo(pp.custo_por_kg, pp.quantidade_utilizada, pp.unidade_medida || 'g'), 0);
  const custoEmb = (embs || []).reduce((a, e) => a + safe(e.preco_unitario) * safe(e.quantidade_utilizada), 0);
  const custoTotal = custoIng + custoPr + custoEmb;
  const divisor = getDivisorRendimento(prod);
  const custoUnitario = divisor > 0 ? custoTotal / divisor : custoTotal;
  return { id: produtoId, custoTotal, custoUnitario };
}

/**
 * Recalcula custo de um combo somando os custos dos componentes.
 * Persiste no DB.
 */
export async function recalcularCombo(db, comboId) {
  const c = await db.getFirstAsync('SELECT * FROM delivery_combos WHERE id = ?', [comboId]);
  if (!c) return null;
  const itens = await db.getAllAsync('SELECT * FROM delivery_combo_itens WHERE combo_id = ?', [comboId]);
  let custo = 0;
  for (const item of itens || []) {
    const qt = safe(item.quantidade);
    if (item.tipo === 'produto') {
      const r = await recalcularProduto(db, item.item_id);
      custo += (r?.custoUnitario || 0) * qt;
    } else if (item.tipo === 'materia_prima') {
      const m = await db.getFirstAsync('SELECT preco_por_kg FROM materias_primas WHERE id = ?', [item.item_id]);
      custo += safe(m?.preco_por_kg) * qt;
    } else if (item.tipo === 'preparo') {
      const p = await db.getFirstAsync('SELECT custo_por_kg FROM preparos WHERE id = ?', [item.item_id]);
      custo += safe(p?.custo_por_kg) * qt;
    } else if (item.tipo === 'embalagem') {
      const e = await db.getFirstAsync('SELECT preco_unitario FROM embalagens WHERE id = ?', [item.item_id]);
      custo += safe(e?.preco_unitario) * qt;
    }
  }
  await db.runAsync('UPDATE delivery_combos SET custo = ? WHERE id = ?', [custo, comboId]);
  return { id: comboId, custo };
}

/**
 * Recalcula TODOS os preparos do usuário. Usado quando um insumo tem
 * preço atualizado.
 */
export async function recalcularTodosPreparos(db) {
  const preparos = await db.getAllAsync('SELECT id FROM preparos');
  for (const p of preparos || []) {
    try { await recalcularPreparo(db, p.id); } catch (e) { console.warn('[cascadeRecalc.preparo]', p.id, e); }
  }
  return (preparos || []).length;
}

/**
 * Recalcula TODOS os combos. Usado quando produtos componentes mudam.
 */
export async function recalcularTodosCombos(db) {
  const combos = await db.getAllAsync('SELECT id FROM delivery_combos');
  for (const c of combos || []) {
    try { await recalcularCombo(db, c.id); } catch (e) { console.warn('[cascadeRecalc.combo]', c.id, e); }
  }
  return (combos || []).length;
}

/**
 * Atalho: cascade completo a partir de mudança em insumo.
 * Recalcula preparos → combos. Produtos são recalculados sob demanda
 * (não persistem `custo` no schema).
 */
export async function cascadeFromInsumo(db) {
  const nPreparos = await recalcularTodosPreparos(db);
  const nCombos = await recalcularTodosCombos(db);
  return { preparos: nPreparos, combos: nCombos };
}
