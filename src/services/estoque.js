/**
 * Serviço de Estoque (M1-10/11/12)
 *
 * Wrapper de alto nível sobre as RPCs `registrar_entrada_estoque` e `baixar_estoque`,
 * mais helpers de listagem/cálculo de saldos e expansão de BOM (Bill of Materials)
 * para baixa automática quando uma venda é registrada.
 *
 * IMPORTANTE: as RPCs são executadas com SECURITY DEFINER e respeitam auth.uid()
 * internamente, então o cliente pode chamá-las com a chave anon sem expor service_role.
 */
import { supabase } from '../config/supabase';

/**
 * Registrar uma entrada de estoque (recebimento de fornecedor, ajuste positivo).
 * Atualiza saldo + custo médio ponderado atomicamente via RPC.
 *
 * @param {object} params
 * @param {'materia_prima'|'embalagem'} params.entidadeTipo
 * @param {number} params.entidadeId
 * @param {number} params.quantidade        — sempre positivo
 * @param {number} params.custoUnitario     — custo do lote recebido
 * @param {string} [params.motivo]          — ex: "NF 1234"
 * @param {string} [params.origemTipo='recebimento']
 * @param {number} [params.origemId]
 * @returns {Promise<number>} id do movimento criado
 */
export async function registrarEntrada({
  entidadeTipo,
  entidadeId,
  quantidade,
  custoUnitario,
  motivo,
  origemTipo = 'recebimento',
  origemId = null,
}) {
  const { data, error } = await supabase.rpc('registrar_entrada_estoque', {
    p_entidade_tipo: entidadeTipo,
    p_entidade_id: entidadeId,
    p_quantidade: quantidade,
    p_custo_unitario: custoUnitario,
    p_motivo: motivo || null,
    p_origem_tipo: origemTipo,
    p_origem_id: origemId,
  });
  if (error) throw error;
  invalidarCacheEstoque();
  return data;
}

/**
 * Baixar estoque (saída por venda, perda, ajuste negativo).
 *
 * @param {object} params
 * @param {'materia_prima'|'embalagem'} params.entidadeTipo
 * @param {number} params.entidadeId
 * @param {number} params.quantidade        — sempre positivo (sinal vem do `tipo='saida'`)
 * @param {string} [params.motivo]
 * @param {string} [params.origemTipo='venda']
 * @param {number} [params.origemId]
 */
export async function baixarEstoque({
  entidadeTipo,
  entidadeId,
  quantidade,
  motivo,
  origemTipo = 'venda',
  origemId = null,
  permitirNegativo = false,
}) {
  const { data, error } = await supabase.rpc('baixar_estoque', {
    p_entidade_tipo: entidadeTipo,
    p_entidade_id: entidadeId,
    p_quantidade: quantidade,
    p_motivo: motivo || null,
    p_origem_tipo: origemTipo,
    p_origem_id: origemId,
    p_permitir_negativo: permitirNegativo,
  });
  if (error) throw error;
  invalidarCacheEstoque();
  return data;
}

/**
 * Estorna (reverte) todos os movimentos de saída de uma venda. Idempotente.
 * Usado quando uma venda é deletada para devolver os itens ao estoque.
 *
 * @param {number} vendaId
 * @returns {Promise<number>} quantidade de movimentos revertidos
 */
export async function estornarEstoquePorVenda(vendaId) {
  if (!vendaId) return 0;
  const { data, error } = await supabase.rpc('estornar_estoque_por_venda', {
    p_venda_id: vendaId,
  });
  if (error) throw error;
  invalidarCacheEstoque();
  return data || 0;
}

/**
 * Invalida caches do supabaseDb wrapper que possam ter dados antigos de
 * materias_primas/embalagens/estoque_movimentos após uma RPC.
 *
 * O wrapper db tem TTL=2s mas RPCs (que rodam server-side) não passam
 * pelo wrapper, então o cache pode servir dados desatualizados por até 2s.
 */
function invalidarCacheEstoque() {
  try {
    const { clearQueryCache } = require('../database/supabaseDb');
    if (typeof clearQueryCache === 'function') clearQueryCache();
  } catch (_) {
    // Cache opcional — sem cache, sem problema.
  }
}

/**
 * Status de estoque de um item.
 * Retorna 'ok' | 'baixo' | 'zerado' baseado em quantidade_estoque vs estoque_minimo.
 */
export function statusEstoque(item) {
  const q = Number(item?.quantidade_estoque) || 0;
  const min = Number(item?.estoque_minimo) || 0;
  if (q <= 0) return 'zerado';
  if (min > 0 && q <= min) return 'baixo';
  return 'ok';
}

/**
 * Lista todos os itens com status de estoque (saldos consolidados).
 * Usado pela tela de Insumos quando flag.modo_avancado_estoque está ativa.
 */
export async function listarSaldosConsolidados(db) {
  const mps = await db.getAllAsync(
    'SELECT id, nome, marca, unidade_medida, quantidade_estoque, estoque_minimo, custo_medio FROM materias_primas ORDER BY nome'
  );
  const embs = await db.getAllAsync(
    'SELECT id, nome, quantidade_estoque, estoque_minimo, custo_medio FROM embalagens ORDER BY nome'
  );
  const itens = [
    ...mps.map((i) => ({ ...i, _tipo: 'materia_prima', _label: 'Insumo' })),
    ...embs.map((i) => ({ ...i, _tipo: 'embalagem', _label: 'Embalagem', unidade_medida: 'un' })),
  ];
  return itens.map((i) => ({ ...i, _status: statusEstoque(i) }));
}

/**
 * Conta itens com estoque baixo ou zerado — para banner do Home.
 */
export async function contarAlertasEstoque(db) {
  const itens = await listarSaldosConsolidados(db);
  const baixo = itens.filter((i) => i._status === 'baixo').length;
  const zerado = itens.filter((i) => i._status === 'zerado' && Number(i.estoque_minimo) > 0).length;
  return { baixo, zerado, total: baixo + zerado };
}

/**
 * Expansão de BOM (Bill of Materials) para um produto:
 * resolve recursivamente os ingredientes diretos + ingredientes dos preparos
 * usados, retornando a lista achatada de matérias-primas + embalagens com
 * quantidade total consumida por unidade do produto.
 *
 * Usado pela baixa automática quando uma venda é registrada.
 *
 * @param {*} db
 * @param {number} produtoId
 * @returns {Promise<Array<{tipo, id, quantidade}>>}
 */
export async function expandirBOM(db, produtoId) {
  const ings = await db.getAllAsync(
    'SELECT materia_prima_id, quantidade_utilizada FROM produto_ingredientes WHERE produto_id = ?',
    [produtoId]
  );
  const preps = await db.getAllAsync(
    'SELECT preparo_id, quantidade_utilizada FROM produto_preparos WHERE produto_id = ?',
    [produtoId]
  );
  const embs = await db.getAllAsync(
    'SELECT embalagem_id, quantidade_utilizada FROM produto_embalagens WHERE produto_id = ?',
    [produtoId]
  );

  const out = new Map(); // key = `${tipo}:${id}`

  function add(tipo, id, qtd) {
    const k = `${tipo}:${id}`;
    out.set(k, (out.get(k) || 0) + qtd);
  }

  for (const ing of ings) add('materia_prima', ing.materia_prima_id, Number(ing.quantidade_utilizada) || 0);
  for (const emb of embs) add('embalagem', emb.embalagem_id, Number(emb.quantidade_utilizada) || 0);

  // Expandir preparos: cada preparo tem seus próprios ingredientes (matérias-primas).
  // O custo já foi resolvido pela receita, mas aqui precisamos da quantidade física consumida.
  // Para isso usamos: (qtd_no_produto / rendimento_total_do_preparo) * qtd_do_ingrediente_no_preparo.
  for (const pp of preps) {
    const [preparo] = await db.getAllAsync(
      'SELECT id, rendimento_total FROM preparos WHERE id = ?',
      [pp.preparo_id]
    );
    if (!preparo) continue;
    const rendimento = Number(preparo.rendimento_total);
    // Sem rendimento válido não é possível calcular consumo proporcional →
    // pular em vez de fallback silencioso para 1 (que corromperia a baixa).
    if (!rendimento || rendimento <= 0) continue;
    const fator = (Number(pp.quantidade_utilizada) || 0) / rendimento;
    if (fator <= 0) continue;
    const ingsPrep = await db.getAllAsync(
      'SELECT materia_prima_id, quantidade_utilizada FROM preparo_ingredientes WHERE preparo_id = ?',
      [pp.preparo_id]
    );
    for (const ing of ingsPrep) {
      add('materia_prima', ing.materia_prima_id, (Number(ing.quantidade_utilizada) || 0) * fator);
    }
  }

  return Array.from(out.entries()).map(([k, qtd]) => {
    const [tipo, id] = k.split(':');
    return { tipo, id: Number(id), quantidade: qtd };
  });
}

/**
 * Baixa em estoque de TODOS os componentes de um produto vendido.
 * Multiplicador = quantidade vendida.
 *
 * @param {*} db
 * @param {number} produtoId
 * @param {number} quantidadeVendida
 * @param {number} vendaId  — para rastreabilidade no movimento
 */
export async function baixarEstoquePorVenda(db, produtoId, quantidadeVendida, vendaId) {
  const bom = await expandirBOM(db, produtoId);
  if (bom.length === 0) return { ok: true, semBOM: true, baixados: 0 };

  // Sequencial (não Promise.all): se um item falhar (saldo insuficiente),
  // paramos imediatamente em vez de criar movimentos parciais que ficam
  // difíceis de estornar.
  const baixados = [];
  for (const b of bom) {
    try {
      const movId = await baixarEstoque({
        entidadeTipo: b.tipo,
        entidadeId: b.id,
        quantidade: b.quantidade * quantidadeVendida,
        motivo: `Venda #${vendaId}`,
        origemTipo: 'venda',
        origemId: vendaId,
      });
      baixados.push(movId);
    } catch (err) {
      // Reverte movimentos já feitos (rollback parcial).
      // Cada movimento criado com origem='venda' será estornado pela RPC.
      try {
        await estornarEstoquePorVenda(vendaId);
      } catch (_) { /* best-effort */ }
      const msg = err?.message || String(err);
      throw new Error(`Falha na baixa de estoque: ${msg}`);
    }
  }
  return { ok: true, baixados: baixados.length };
}
