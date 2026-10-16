/**
 * Gravação segura no wrapper SQL → PostgREST (sem transação no web).
 *
 * 1) Serialização por entidade (`serializarSalvamento`)
 *
 * As telas de edição (combo, ficha técnica, receita base) regravam a composição
 * com "insere as linhas novas, depois apaga as antigas pelos ids lidos antes".
 * Isso é seguro SOZINHO — mas autosave (debounce/imediato) e "Salvar e voltar"
 * disparavam a mesma regravação EM PARALELO. As duas execuções liam os mesmos
 * ids antigos, cada uma inseria o seu conjunto novo e cada uma apagava só os
 * antigos → sobravam os DOIS conjuntos novos (combo com 6 itens em vez de 3,
 * CMV dobrado). Aqui cada entidade (chave, ex.: `combo:12`) tem uma fila:
 *  - nada rodando → executa na hora;
 *  - algo rodando → agenda UMA reexecução para quando terminar. Pedidos que
 *    chegam enquanto já há uma agendada só trocam a função agendada (vale o
 *    estado mais recente) e recebem a mesma promise.
 * A promise devolvida resolve quando o salvamento que cobre o pedido termina,
 * então `await serializarSalvamento(...)` antes de navegar é confiável.
 *
 * 2) Exclusão pai-primeiro (`excluirPaiPrimeiro`)
 *
 * Excluir "itens e depois o pai" são dois requests: se a aba fecha no meio,
 * fica um pai vazio visível (combo sem itens). Com FK `ON DELETE CASCADE` nos
 * filhos, apagar o PAI primeiro remove pai + filhos num único statement
 * atômico. Se o banco recusar por FK (cascade ausente), cai no caminho antigo.
 *
 * Módulo puro (sem Supabase/React) para ser testável em node:test.
 */

export function criarSerializador() {
  // chave -> { emVoo: Promise, pendente: null | { fn, promise, resolve, reject } }
  const filas = new Map();

  function iniciar(chave, fila, fn) {
    const p = Promise.resolve().then(fn);
    fila.emVoo = p;
    const seguir = () => {
      const pend = fila.pendente;
      if (pend) {
        fila.pendente = null;
        iniciar(chave, fila, pend.fn).then(pend.resolve, pend.reject);
      } else {
        filas.delete(chave);
      }
    };
    p.then(seguir, seguir);
    return p;
  }

  function serializar(chave, fn) {
    const fila = filas.get(chave);
    if (!fila) {
      const nova = { emVoo: null, pendente: null };
      filas.set(chave, nova);
      return iniciar(chave, nova, fn);
    }
    if (fila.pendente) {
      fila.pendente.fn = fn; // o estado mais recente vence
      return fila.pendente.promise;
    }
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    fila.pendente = { fn, promise, resolve, reject };
    return promise;
  }

  // Espera a fila da chave esvaziar (inclui reexecuções agendadas no meio do caminho).
  async function aguardar(chave) {
    let fila = filas.get(chave);
    while (fila) {
      const alvo = fila.pendente ? fila.pendente.promise : fila.emVoo;
      try { await alvo; } catch (_) {}
      fila = filas.get(chave);
    }
  }

  function ocupado(chave) {
    return filas.has(chave);
  }

  return { serializar, aguardar, ocupado };
}

// Instância compartilhada: telas diferentes que editam a mesma entidade usam a
// mesma fila (a chave inclui o tipo + id, ex.: `produto:7`, `preparo:3`).
const serializadorPadrao = criarSerializador();
export const serializarSalvamento = serializadorPadrao.serializar;
export const aguardarSalvamento = serializadorPadrao.aguardar;

/**
 * Exclui o registro pai antes dos filhos (ver cabeçalho).
 * @param db       wrapper com runAsync
 * @param pai      { tabela, id }
 * @param filhos   [{ tabela, coluna }] — junctions com FK para o pai
 */
export async function excluirPaiPrimeiro(db, pai, filhos = []) {
  try {
    await db.runAsync(`DELETE FROM ${pai.tabela} WHERE id = ?`, [pai.id]);
  } catch (e) {
    // Sem CASCADE o Postgres recusa ("violates foreign key constraint"):
    // aí só resta o caminho antigo, filhos e depois o pai.
    if (!/foreign key/i.test(String(e?.message || ''))) throw e;
    for (const f of filhos) {
      await db.runAsync(`DELETE FROM ${f.tabela} WHERE ${f.coluna} = ?`, [pai.id]);
    }
    await db.runAsync(`DELETE FROM ${pai.tabela} WHERE id = ?`, [pai.id]);
    return;
  }
  // Limpeza defensiva (no-op com o CASCADE). Falha aqui deixa no máximo linhas
  // órfãs invisíveis — nunca um pai quebrado na tela.
  for (const f of filhos) {
    try { await db.runAsync(`DELETE FROM ${f.tabela} WHERE ${f.coluna} = ?`, [pai.id]); } catch (_) {}
  }
}
