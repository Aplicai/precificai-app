/**
 * Grava o primeiro produto guiado (PrimeiroProdutoScreen): os ingredientes,
 * o produto e as ligações produto ↔ ingrediente.
 *
 * O SQL é o MESMO dos formulários atuais (MateriaPrimaFormScreen ~665 e
 * EntityCreateModal ~1683/1704) para os dados ficarem idênticos aos de quem
 * cadastra pelo caminho normal. Mudou lá? Mude aqui (os testes em
 * __tests__/primeiroProdutoService.test.mjs travam o SQL).
 *
 * Sem transação no wrapper (PostgREST): se algo falha no meio, apaga o que
 * já criou, um id por vez (WHERE IN não é suportado), e repassa o erro.
 *
 * @param db  wrapper de getDatabase()
 * @param payload  montarPayloadPrimeiroProduto() (src/utils/primeiroProduto.js)
 * @returns {{ produtoId, materiaIds }}
 */
export async function salvarPrimeiroProduto(db, payload) {
  const { produto, materias, quantidades, preco } = payload || {};
  if (!produto?.nome || !produto?.unidade_rendimento) throw new Error('Produto sem nome ou rendimento');
  if (!materias?.length || materias.length !== quantidades?.length) throw new Error('Receita sem ingredientes');

  const materiaIds = [];
  const ligacoes = [];
  let produtoId = null;

  async function desfazer() {
    const apagar = [
      ...ligacoes.map((id) => ['produto_ingredientes', id]),
      ...(produtoId ? [['produtos', produtoId]] : []),
      ...materiaIds.map((id) => ['materias_primas', id]),
    ];
    for (const [tabela, id] of apagar) {
      try { await db.runAsync(`DELETE FROM ${tabela} WHERE id = ?`, [id]); } catch (_) { /* melhor esforço */ }
    }
  }

  try {
    for (const m of materias) {
      const r = await db.runAsync(
        'INSERT INTO materias_primas (nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES (?,?,?,?,?,?,?,?,?)',
        [m.nome, m.marca || '', m.categoria_id ?? null, m.quantidade_bruta, m.quantidade_liquida, m.fator_correcao, m.unidade_medida, m.valor_pago, m.preco_por_kg]
      );
      const id = r?.lastInsertRowId;
      if (!id) throw new Error('Ingrediente não foi salvo');
      materiaIds.push(id);
      if (m.valor_pago > 0) {
        try {
          await db.runAsync(
            'INSERT INTO historico_precos (materia_prima_id, valor_pago, preco_por_kg) VALUES (?,?,?)',
            [id, m.valor_pago, m.preco_por_kg]
          );
        } catch (_) { /* igual ao formulário: histórico é opcional */ }
      }
    }

    const r = await db.runAsync(
      `INSERT INTO produtos (nome, categoria_id, rendimento_total, unidade_rendimento, rendimento_unidades,
       tempo_preparo, preco_venda, margem_lucro_produto, validade_dias, temp_congelado, tempo_congelado,
       temp_refrigerado, tempo_refrigerado, temp_ambiente, tempo_ambiente,
       modo_preparo, observacoes, embalagem_delivery_id, embalagem_delivery_quantidade, embalagens_delivery) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        produto.nome, null, produto.rendimento_total, produto.unidade_rendimento, produto.rendimento_unidades,
        0, preco?.preco || 0, 0, 0, 0, 0,
        0, 0, 0, 0,
        '', '',
        null, null, null,
      ]
    );
    produtoId = r?.lastInsertRowId;
    if (!produtoId) throw new Error('Produto não foi salvo');

    for (let i = 0; i < materiaIds.length; i++) {
      const lr = await db.runAsync(
        'INSERT INTO produto_ingredientes (produto_id, materia_prima_id, quantidade_utilizada) VALUES (?,?,?)',
        [produtoId, materiaIds[i], quantidades[i]]
      );
      if (lr?.lastInsertRowId) ligacoes.push(lr.lastInsertRowId);
    }
  } catch (e) {
    await desfazer();
    throw e;
  }

  return { produtoId, materiaIds };
}
