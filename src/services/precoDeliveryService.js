/**
 * Sessão 28.26: service único de persistência do "preço delivery cobrado pelo
 * usuário" em `produto_preco_delivery`.
 *
 * MOTIVAÇÃO:
 * Antes da extração, a mesma lógica de upsert estava replicada em 3 telas:
 *   - DeliveryHubScreen.salvarPrecoDelivery
 *   - SimulacaoProdutoScreen.salvarComoPrecoDelivery
 *   - PrecosPlataformaScreen.salvarPreco
 *
 * Cada uma com pequenas variações + os mesmos bugs históricos:
 *   - 28.21: ON CONFLICT não funcionava no wrapper supabaseDb → migramos pra
 *     SELECT-first → UPDATE OU INSERT.
 *   - 28.24: NOW() é Postgres-only → trocamos pra CURRENT_TIMESTAMP em SQLite.
 *
 * Manter 3 cópias = 3x risco de divergência.
 *
 * USO:
 *   import { upsertPrecoDelivery } from '../services/precoDeliveryService';
 *   await upsertPrecoDelivery(db, { produtoId, plataformaId, precoVenda });
 */

const safeNum = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Persiste o preço delivery cobrado pelo usuário em uma plataforma específica.
 *
 * Comportamento:
 *  - Se `precoVenda > 0` → upsert (UPDATE se já existe par produto×plataforma, INSERT senão)
 *  - Se `precoVenda <= 0` ou inválido → DELETE da linha (zerado = "não cobro nada nesta plat")
 *
 * @param {object} db - instância do database (getDatabase())
 * @param {object} params
 * @param {number} params.produtoId
 * @param {number} params.plataformaId
 * @param {number|string} params.precoVenda - aceita "12,50" e "12.50"
 * @returns {Promise<{ ok: boolean, action: 'update'|'insert'|'delete'|'noop', error?: string }>}
 */
export async function upsertPrecoDelivery(db, { produtoId, plataformaId, precoVenda }) {
  if (!db || !produtoId || !plataformaId) {
    return { ok: false, action: 'noop', error: 'Argumentos inválidos' };
  }
  const num = safeNum(precoVenda);
  try {
    if (num > 0) {
      // SELECT-first (28.21 fix): wrapper supabaseDb não retorna `changes` confiável
      const exists = await db.getAllAsync(
        'SELECT id FROM produto_preco_delivery WHERE produto_id = ? AND plataforma_id = ? LIMIT 1',
        [produtoId, plataformaId]
      );
      if (exists && exists.length > 0) {
        // 28.24 fix: CURRENT_TIMESTAMP (não NOW() — não existe em SQLite local)
        await db.runAsync(
          'UPDATE produto_preco_delivery SET preco_venda = ?, updated_at = CURRENT_TIMESTAMP WHERE produto_id = ? AND plataforma_id = ?',
          [num, produtoId, plataformaId]
        );
        return { ok: true, action: 'update' };
      }
      await db.runAsync(
        'INSERT INTO produto_preco_delivery (produto_id, plataforma_id, preco_venda) VALUES (?,?,?)',
        [produtoId, plataformaId, num]
      );
      return { ok: true, action: 'insert' };
    }
    // valor zerado/inválido: apaga
    await db.runAsync(
      'DELETE FROM produto_preco_delivery WHERE produto_id = ? AND plataforma_id = ?',
      [produtoId, plataformaId]
    );
    return { ok: true, action: 'delete' };
  } catch (e) {
    if (typeof console !== 'undefined') {
      console.warn('[precoDeliveryService.upsert]', e?.message || e);
    }
    return { ok: false, action: 'noop', error: e?.message || String(e) };
  }
}

/**
 * Carrega o map { `${produtoId}-${plataformaId}`: precoVenda } pra todas as
 * plataformas. Útil em telas que exibem todos os preços salvos numa tabela
 * (Visão Geral / Simulador em Lote).
 *
 * @param {object} db
 * @returns {Promise<Object<string, number>>}
 */
export async function carregarPrecosDeliveryMap(db) {
  if (!db) return {};
  try {
    const rows = await db.getAllAsync(
      'SELECT produto_id, plataforma_id, preco_venda FROM produto_preco_delivery'
    );
    const map = {};
    (rows || []).forEach((r) => {
      map[`${r.produto_id}-${r.plataforma_id}`] = safeNum(r.preco_venda);
    });
    return map;
  } catch (_) {
    return {};
  }
}
