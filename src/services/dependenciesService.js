/**
 * Sprint 2 S5 — Helpers centralizados de DEPENDÊNCIAS antes de exclusão.
 *
 * MOTIVAÇÃO (audit P0-05):
 * Cada tela checava (ou ignorava!) dependências de forma diferente:
 *   - MateriasPrimasScreen: checa preparo_ingredientes ANTES de deletar (✓)
 *   - MateriaPrimaFormScreen: deletava direto, sem aviso → órfãos em 4 tabelas
 *   - EmbalagensScreen: deletava direto → produtos referenciam embalagem morta
 *   - DeliveryCombosScreen: cascade manual em delivery_combo_itens (✓)
 *   - delivery_produtos: nunca verifica se está em algum delivery_combo_itens (órfão)
 *
 * Resultado: produto exibe "categoria desconhecida", custo unitário NaN,
 * relatórios contam itens fantasmas. Sintoma: lista que parece carregada mas
 * cliques abrem tela em branco.
 *
 * USO:
 *   import { contarDependencias, formatarMensagemDeps } from '../services/dependenciesService';
 *
 *   const deps = await contarDependencias(db, 'materia_prima', id);
 *   if (deps.total > 0) {
 *     const msg = formatarMensagemDeps(deps);
 *     // Mostra confirmação destrutiva ou bloqueia exclusão
 *   }
 */

/**
 * Mapeia o tipo de entidade → consultas que verificam onde ela aparece.
 * Cada consulta retorna o COUNT de referências.
 *
 * IMPORTANTE: as queries usam apenas nomes de tabelas e colunas hardcoded
 * (whitelist) — nunca interpolam input do usuário em SQL.
 */
const DEPENDENCY_QUERIES = Object.freeze({
  materia_prima: [
    { tabela: 'preparo_ingredientes', label: 'preparos', sql: 'SELECT COUNT(*) AS n FROM preparo_ingredientes WHERE materia_prima_id = ?' },
    { tabela: 'produto_ingredientes', label: 'produtos (uso direto)', sql: 'SELECT COUNT(*) AS n FROM produto_ingredientes WHERE materia_prima_id = ?' },
    { tabela: 'historico_precos',     label: 'histórico de preços', sql: 'SELECT COUNT(*) AS n FROM historico_precos WHERE materia_prima_id = ?' },
  ],
  preparo: [
    { tabela: 'produto_preparos', label: 'produtos', sql: 'SELECT COUNT(*) AS n FROM produto_preparos WHERE preparo_id = ?' },
    { tabela: 'preparo_ingredientes', label: 'sub-preparos (linhas)', sql: 'SELECT COUNT(*) AS n FROM preparo_ingredientes WHERE preparo_id = ?' },
  ],
  embalagem: [
    { tabela: 'produto_embalagens', label: 'produtos', sql: 'SELECT COUNT(*) AS n FROM produto_embalagens WHERE embalagem_id = ?' },
  ],
  produto: [
    { tabela: 'produto_ingredientes', label: 'ingredientes (linhas)', sql: 'SELECT COUNT(*) AS n FROM produto_ingredientes WHERE produto_id = ?' },
    { tabela: 'produto_preparos',     label: 'preparos (linhas)',     sql: 'SELECT COUNT(*) AS n FROM produto_preparos WHERE produto_id = ?' },
    { tabela: 'produto_embalagens',   label: 'embalagens (linhas)',   sql: 'SELECT COUNT(*) AS n FROM produto_embalagens WHERE produto_id = ?' },
    { tabela: 'delivery_produto_itens', label: 'configurações delivery', sql: 'SELECT COUNT(*) AS n FROM delivery_produto_itens WHERE produto_id = ?' },
    { tabela: 'vendas',               label: 'vendas registradas',     sql: 'SELECT COUNT(*) AS n FROM vendas WHERE produto_id = ?' },
  ],
  delivery_combo: [
    { tabela: 'delivery_combo_itens', label: 'itens (linhas)', sql: 'SELECT COUNT(*) AS n FROM delivery_combo_itens WHERE combo_id = ?' },
  ],
  delivery_produto: [
    { tabela: 'delivery_combo_itens', label: 'combos delivery', sql: 'SELECT COUNT(*) AS n FROM delivery_combo_itens WHERE delivery_produto_id = ?' },
  ],
  categoria_insumo: [
    { tabela: 'materias_primas', label: 'insumos', sql: 'SELECT COUNT(*) AS n FROM materias_primas WHERE categoria_id = ?' },
  ],
  categoria_preparo: [
    { tabela: 'preparos', label: 'preparos', sql: 'SELECT COUNT(*) AS n FROM preparos WHERE categoria_id = ?' },
  ],
  categoria_embalagem: [
    { tabela: 'categorias_embalagens', label: 'embalagens', sql: 'SELECT COUNT(*) AS n FROM embalagens WHERE categoria_id = ?' },
  ],
  categoria_produto: [
    { tabela: 'categorias_produtos', label: 'produtos', sql: 'SELECT COUNT(*) AS n FROM produtos WHERE categoria_id = ?' },
  ],
});

/**
 * Conta quantas referências existem para uma entidade antes de excluí-la.
 * Retorna shape:
 *   {
 *     total: number,        // soma de todas as referências
 *     porTabela: [{ label, n }],
 *     temBloqueio: boolean, // true se há vendas (não permite delete sem soft-delete)
 *   }
 */
export async function contarDependencias(db, tipo, id) {
  const queries = DEPENDENCY_QUERIES[tipo];
  if (!queries) {
    if (typeof console !== 'undefined') console.warn(`[dependenciesService] tipo desconhecido: ${tipo}`);
    return { total: 0, porTabela: [], temBloqueio: false };
  }

  const porTabela = [];
  let total = 0;
  let temBloqueio = false;

  for (const q of queries) {
    try {
      const rows = await db.getAllAsync(q.sql, [id]);
      const n = rows?.[0]?.n || 0;
      if (n > 0) {
        porTabela.push({ label: q.label, n });
        total += n;
        if (q.tabela === 'vendas') temBloqueio = true;
      }
    } catch (err) {
      // Tabela pode não existir em schemas mais antigos — log e segue
      console.warn(`[dependenciesService.contarDependencias] erro em ${q.tabela}:`, err?.message);
    }
  }

  return { total, porTabela, temBloqueio };
}

/**
 * Gera mensagem amigável (PT-BR) descrevendo as dependências encontradas.
 * Use no `Confirm` antes do delete destrutivo.
 *
 * Exemplo de saída:
 *   "Esta matéria-prima está em uso em:
 *    • 3 preparos
 *    • 2 produtos (uso direto)
 *    • 7 registros de histórico de preços
 *    Excluir vai zerar o custo desses itens. Deseja continuar?"
 */
export function formatarMensagemDeps(deps, { acao = 'excluir', entidade = 'item' } = {}) {
  if (!deps || deps.total === 0) {
    return `${acao === 'excluir' ? 'Excluir' : 'Alterar'} este ${entidade}? Esta ação não pode ser desfeita.`;
  }
  const linhas = deps.porTabela.map(d => `• ${d.n} ${d.label}`).join('\n');
  if (deps.temBloqueio) {
    return `Este ${entidade} possui vendas registradas:\n${linhas}\n\nExclusão definitiva não é permitida — você pode arquivá-lo (soft-delete) para preservar o histórico de relatórios.`;
  }
  return `Este ${entidade} está em uso em:\n${linhas}\n\n${acao === 'excluir' ? 'Excluir' : 'Alterar'} vai impactar esses itens. Deseja continuar?`;
}

/**
 * Versão para soft-delete (Sprint 2 S14 — LGPD): marca registros como
 * `deleted_at = ISO_NOW` ao invés de DELETE. Tabelas precisam ter a coluna
 * `deleted_at TEXT NULL` (migração futura).
 *
 * @returns {Promise<boolean>} true se a coluna existir e o update tiver sucesso
 */
export async function softDelete(db, tabela, id) {
  // Whitelist defensiva — tabelas que TEM coluna deleted_at (após migração)
  const SOFT_DELETE_TABLES = Object.freeze([
    'produtos', 'preparos', 'embalagens', 'materias_primas',
    'delivery_produtos', 'delivery_combos',
  ]);
  if (!SOFT_DELETE_TABLES.includes(tabela)) {
    throw new Error(`softDelete: tabela "${tabela}" não habilitada para soft-delete`);
  }
  const now = new Date().toISOString();
  try {
    await db.runAsync(`UPDATE ${tabela} SET deleted_at = ? WHERE id = ?`, [now, id]);
    return true;
  } catch (err) {
    console.warn(`[dependenciesService.softDelete] coluna deleted_at não existe em ${tabela}? Caia para hard delete.`, err?.message);
    return false;
  }
}

export default { contarDependencias, formatarMensagemDeps, softDelete };
