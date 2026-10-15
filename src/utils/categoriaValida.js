/**
 * Categoria de ingrediente/embalagem/receita base vem de tabelas diferentes
 * (categorias_insumos / categorias_embalagens / categorias_preparos), e
 * nenhuma delas é categorias_produtos. Bug do tutorial 05: o formulário de
 * ingrediente aberto por dentro do produto herdava a categoria DO PRODUTO e o
 * Supabase recusava o INSERT (foreign key materias_primas_categoria_id_fkey).
 */

/**
 * Categoria padrão a passar para o formulário filho aberto em cascata.
 * Só herda quando pai e filho usam a MESMA tabela de categorias
 * (receita base criada dentro de outra receita base).
 */
export function categoriaFilhoDefault(tipoFilho, pai) {
  if (!pai || pai.categoriaId == null || pai.categoriaId === '') return null;
  if (tipoFilho === 'preparo' && pai.mode === 'preparo') return pai.categoriaId;
  return null;
}

/**
 * Devolve o id se ele existe na tabela de categorias do item, senão null
 * (o item é salvo sem categoria em vez de falhar).
 *  - categorias: lista em memória já carregada da tabela certa;
 *  - lookup(id): opcional, consulta o banco (cobre categoria recém-criada que
 *    ainda não entrou na lista). Erro no lookup → null.
 */
export async function resolveCategoriaId(id, categorias, lookup) {
  if (id == null || id === '') return null;
  const alvo = String(id);
  const naLista = (categorias || []).some(c => c && String(c.id) === alvo);
  const asNumber = Number(id);
  const valor = Number.isFinite(asNumber) ? asNumber : id;
  if (naLista) return valor;
  if (typeof lookup !== 'function') return null;
  try {
    const row = await lookup(valor);
    return row && row.id != null ? valor : null;
  } catch (_) {
    return null;
  }
}
