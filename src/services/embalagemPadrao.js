/**
 * embalagemPadrao — APP-36
 *
 * Gerencia o vínculo "embalagem é padrão para [categoria(s)] no canal X".
 *
 * Tabela `embalagem_categoria_padrao` (criada na migration 20260429210000):
 *   - user_id, embalagem_id, categoria_id, canal ('balcao'|'delivery')
 *   - UNIQUE(user_id, categoria_id, canal) — uma embalagem padrão por categoria/canal.
 *
 * Quando o usuário cria/edita uma embalagem e marca categorias como
 * padrão, fazemos:
 *   - DELETE de qualquer registro anterior dessa embalagem nesse canal
 *   - INSERT um registro por categoria selecionada
 *   - Se outra embalagem já era padrão dessa categoria, ela vira "não-padrão"
 *     automaticamente via UNIQUE constraint.
 *
 * Quando o usuário cria/edita produto e escolhe categoria, chamamos
 * `getEmbalagemPadrao(categoria_id, canal)` pra pré-selecionar.
 */

const safe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Lista as categorias para as quais uma embalagem é padrão num canal.
 *
 * @returns {Promise<number[]>} array de categoria_ids
 */
export async function getCategoriasPadraoDaEmbalagem(db, embalagemId, canal = 'balcao') {
  if (!embalagemId) return [];
  try {
    const rows = await db.getAllAsync(
      'SELECT categoria_id FROM embalagem_categoria_padrao WHERE embalagem_id = ? AND canal = ?',
      [embalagemId, canal]
    );
    return (rows || []).map(r => r.categoria_id).filter(Boolean);
  } catch (_) {
    // Tabela pode não existir ainda (migration não rodada)
    return [];
  }
}

/**
 * Acha a embalagem padrão de uma categoria num canal.
 *
 * @returns {Promise<number|null>} embalagem_id ou null
 */
export async function getEmbalagemPadrao(db, categoriaId, canal = 'balcao') {
  if (!categoriaId) return null;
  try {
    const row = await db.getFirstAsync(
      'SELECT embalagem_id FROM embalagem_categoria_padrao WHERE categoria_id = ? AND canal = ? LIMIT 1',
      [categoriaId, canal]
    );
    return row?.embalagem_id || null;
  } catch (_) { return null; }
}

/**
 * Define que uma embalagem é padrão para um conjunto de categorias num canal.
 * Sobrescreve completamente a configuração anterior dessa embalagem nesse canal.
 *
 * @param {number} embalagemId
 * @param {number[]} categoriaIds
 * @param {'balcao'|'delivery'} canal
 */
export async function setCategoriasPadraoDaEmbalagem(db, embalagemId, categoriaIds, canal = 'balcao') {
  if (!embalagemId) return;
  try {
    await db.runAsync(
      'DELETE FROM embalagem_categoria_padrao WHERE embalagem_id = ? AND canal = ?',
      [embalagemId, canal]
    );
    for (const catId of (categoriaIds || []).filter(Boolean)) {
      // ON CONFLICT é melhor mas como compartilhamos wrapper Supabase/SQLite,
      // usamos try/catch pra ignorar UNIQUE conflicts (categoria já tem outra padrão).
      try {
        await db.runAsync(
          'INSERT INTO embalagem_categoria_padrao (embalagem_id, categoria_id, canal) VALUES (?, ?, ?)',
          [embalagemId, catId, canal]
        );
      } catch (e) {
        // UNIQUE constraint — outra embalagem já era padrão dessa categoria.
        // Forçamos a substituição: deleta a outra e tenta de novo.
        try {
          await db.runAsync(
            'DELETE FROM embalagem_categoria_padrao WHERE categoria_id = ? AND canal = ?',
            [catId, canal]
          );
          await db.runAsync(
            'INSERT INTO embalagem_categoria_padrao (embalagem_id, categoria_id, canal) VALUES (?, ?, ?)',
            [embalagemId, catId, canal]
          );
        } catch (e2) {
          if (typeof console !== 'undefined' && console.warn) console.warn('[embalagemPadrao.set] falha:', e2);
        }
      }
    }
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) console.warn('[embalagemPadrao.set] tabela inexistente?', e?.message);
  }
}

/**
 * Busca o NOME da categoria pra qual essa embalagem é padrão (pra UI badge).
 */
export async function getNomesCategoriasPadrao(db, embalagemId, canal = 'balcao') {
  const ids = await getCategoriasPadraoDaEmbalagem(db, embalagemId, canal);
  if (ids.length === 0) return [];
  try {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.getAllAsync(
      `SELECT nome FROM categorias_produtos WHERE id IN (${placeholders})`,
      ids
    );
    return (rows || []).map(r => r.nome);
  } catch (_) { return []; }
}
