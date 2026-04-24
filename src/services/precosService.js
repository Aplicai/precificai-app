/**
 * Sprint 2 S4 — Wrapper cliente para o RPC transacional `atualizar_precos_lote`.
 *
 * MOTIVAÇÃO (audit P0-04):
 * O app local usa SQLite como fonte primária; cada UPDATE é atômico por linha.
 * Mas quando precisamos atualizar N produtos em uma única operação atômica
 * (ex: reajuste em lote por categoria, sincronização pós-importação), o cliente
 * precisava fazer N requisições separadas — qualquer falha deixava estado parcial.
 *
 * Este wrapper centraliza a chamada ao RPC server-side `atualizar_precos_lote`
 * (definido em `supabase/migrations/20260424000000_s4_rpcs_transacionais.sql`).
 * O RPC roda PL/pgSQL com `SECURITY INVOKER` (respeita RLS), grava `historico_precos`
 * e retorna por linha o status de cada item.
 *
 * USO:
 *   import { atualizarPrecosLote } from '../services/precosService';
 *
 *   const alteracoes = [
 *     { produto_id: 1, novo_preco: 25.50, motivo: 'Reajuste insumos jan/26' },
 *     { produto_id: 2, novo_preco: 30.00 },
 *   ];
 *   const { ok, falhas, total } = await atualizarPrecosLote(alteracoes);
 *   if (falhas.length > 0) {
 *     // Mostrar quais produtos falharam (id + mensagem)
 *   }
 *
 * NOTA: este wrapper opera no Supabase (cloud). O SQLite local NÃO é tocado.
 * Quando o app reconciliar (sync futuro), o SQLite será atualizado via pull.
 * Por enquanto, telas que usam SQLite continuam fazendo UPDATEs individuais
 * — o RPC é opt-in para fluxos de batch reais.
 */

import { supabase } from '../config/supabase';

/**
 * Validações cliente antes de submeter ao RPC (defesa em profundidade —
 * o RPC também valida no servidor).
 */
function validarAlteracoes(alteracoes) {
  if (!Array.isArray(alteracoes)) {
    throw new Error('alteracoes deve ser um array');
  }
  if (alteracoes.length === 0) {
    throw new Error('alteracoes vazio — nada para fazer');
  }
  if (alteracoes.length > 500) {
    // Limite arbitrário para evitar payload gigante; aumentar se necessário.
    throw new Error(`Máximo 500 alterações por chamada (recebido: ${alteracoes.length})`);
  }
  for (const a of alteracoes) {
    if (!a || typeof a !== 'object') throw new Error('Cada alteração deve ser um objeto');
    if (typeof a.produto_id !== 'number' || !Number.isInteger(a.produto_id) || a.produto_id <= 0) {
      throw new Error(`produto_id inválido: ${JSON.stringify(a.produto_id)}`);
    }
    if (typeof a.novo_preco !== 'number' || !Number.isFinite(a.novo_preco) || a.novo_preco < 0) {
      throw new Error(`novo_preco inválido para produto ${a.produto_id}: ${a.novo_preco}`);
    }
    if (a.motivo != null && typeof a.motivo !== 'string') {
      throw new Error(`motivo deve ser string para produto ${a.produto_id}`);
    }
  }
}

/**
 * Atualiza N preços de produtos atomicamente.
 *
 * @param {Array<{produto_id: number, novo_preco: number, motivo?: string}>} alteracoes
 * @returns {Promise<{
 *   ok: Array<{produto_id: number}>,
 *   falhas: Array<{produto_id: number, mensagem: string}>,
 *   total: number,
 * }>}
 */
export async function atualizarPrecosLote(alteracoes) {
  validarAlteracoes(alteracoes);

  const { data, error } = await supabase.rpc('atualizar_precos_lote', {
    p_alteracoes: alteracoes,
  });

  if (error) {
    // Erro de transporte/auth/RLS — propaga para a UI tratar.
    console.error('[precosService.atualizarPrecosLote]', error);
    throw new Error(error.message || 'Falha ao atualizar preços em lote');
  }

  // Shape esperado: rows com { produto_id, atualizado, mensagem }
  const rows = Array.isArray(data) ? data : [];
  const ok = rows.filter(r => r.atualizado).map(r => ({ produto_id: r.produto_id }));
  const falhas = rows
    .filter(r => !r.atualizado)
    .map(r => ({ produto_id: r.produto_id, mensagem: r.mensagem || 'Erro desconhecido' }));

  return { ok, falhas, total: rows.length };
}

export default { atualizarPrecosLote };
