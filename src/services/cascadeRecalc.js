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
 *
 * Sessão 28.37: agora também considera sub-preparos (preparos usados como ingrediente
 * dentro de outro preparo). Lê preparo_subpreparos e soma calcCustoPreparo de cada.
 * NÃO é recursivo aqui — cada sub-preparo usa seu `custo_por_kg` atual em DB.
 * `recalcularTodosPreparos` cuida da ordem iterando N vezes até estabilizar.
 */
export async function recalcularPreparo(db, preparoId) {
  const p = await db.getFirstAsync('SELECT * FROM preparos WHERE id = ?', [preparoId]);
  if (!p) return null;
  const ings = await db.getAllAsync(
    'SELECT pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM preparo_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id WHERE pi.preparo_id = ?',
    [preparoId]
  );
  const custoInsumos = (ings || []).reduce((a, i) => a + calcCustoIngrediente(i.preco_por_kg, i.quantidade_utilizada, i.unidade_medida, i.unidade_medida), 0);

  // Sessão 28.37: sub-preparos. Silencioso se a tabela não existir (DB legado).
  let custoSubs = 0;
  try {
    const subs = await db.getAllAsync(
      'SELECT ps.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM preparo_subpreparos ps JOIN preparos pr ON pr.id = ps.sub_preparo_id WHERE ps.preparo_id = ?',
      [preparoId]
    );
    custoSubs = (subs || []).reduce(
      (a, s) => a + (Number(s.custo_por_kg) > 0 && Number(s.quantidade_utilizada) > 0
        ? calcCustoPreparo(s.custo_por_kg, s.quantidade_utilizada, s.unidade_medida || 'g')
        : 0),
      0
    );
  } catch (_) { /* DB legado sem preparo_subpreparos */ }

  const custoTotal = custoInsumos + custoSubs;
  const rendimento = safe(p.rendimento_total);
  // Sessão 28.72 — fórmula canônica do form (sempre * 1000)
  const custoPorKg = rendimento > 0
    ? (custoTotal / rendimento) * 1000
    : custoTotal;
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
  // Sessão 28.44 — bug #4: schema delivery_combos não tem coluna `custo`.
  // Antes: UPDATE falhava silenciosamente (catch warns) toda vez. Agora:
  // não persistimos. DeliveryCombosScreen sempre re-deriva client-side.
  // (Se um dia for útil cachear, adicionar coluna em migration primeiro.)
  return { id: comboId, custo };
}

/**
 * Recalcula TODOS os preparos do usuário. Usado quando um insumo tem
 * preço atualizado.
 *
 * Sessão 28.37: agora itera até estabilizar (max 5 passadas) — quando preparo A
 * usa preparo B (sub-preparo), recalcular A precisa do custo_por_kg atualizado
 * de B. Sem ordenação topológica, basta iterar até que nenhum custo mude. Com
 * 10 níveis de profundidade real, 5 passadas garante convergência com folga.
 * Ciclos são prevenidos no UI (PreparoForm.loadPreparosCatalogo + CHECK no DB).
 */
export async function recalcularTodosPreparos(db) {
  const preparos = await db.getAllAsync('SELECT id FROM preparos');
  const ids = (preparos || []).map(p => p.id);
  const MAX_PASSES = 5;
  let prevHash = '';
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    for (const id of ids) {
      try { await recalcularPreparo(db, id); } catch (e) { console.warn('[cascadeRecalc.preparo]', id, e); }
    }
    // Lê custos atuais — se nada mudou desde a passada anterior, encerra.
    try {
      const snap = await db.getAllAsync('SELECT id, custo_por_kg FROM preparos ORDER BY id');
      const hash = (snap || []).map(r => `${r.id}:${Number(r.custo_por_kg).toFixed(6)}`).join('|');
      if (hash === prevHash) break;
      prevHash = hash;
    } catch (_) { break; }
  }
  return ids.length;
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
  // Sessão 28.36: invalidação granular não bastava — chaves de cache do
  // wrapper supabaseDb incluem o SQL inteiro, então 'SELECT * FROM preparos'
  // NÃO incluía 'materias_primas' e ficava em cache mesmo após o cascade
  // atualizar custo_por_kg. Resultado: tela Preparos mostrava custo antigo
  // por até 2s após editar insumo. Clear total é simples e robusto.
  try {
    const { clearQueryCache } = await import('../database/supabaseDb');
    clearQueryCache?.();
  } catch (_) {}
  return { preparos: nPreparos, combos: nCombos };
}
