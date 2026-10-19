/**
 * Executa a migração do rendimento das receitas do Kit de Início (ver
 * src/utils/migracaoRendimentoKit.js para a regra).
 *
 * Uma vez por usuário: a flag fica no user_metadata do Supabase Auth (vale em
 * todos os aparelhos, sem mudar o schema). Mesmo sem a flag é idempotente: depois
 * de corrigida, a receita não tem mais o rendimento antigo.
 *
 * Falha de leitura ([] marcado como erro pelo wrapper) ou de gravação → não
 * marca a flag; tenta de novo no próximo login.
 */
import { isErrorResult } from '../database/dbResult';
import { cascadeFromPreparo } from './cascadeRecalc';
import {
  FLAG_MIGRACAO_RENDIMENTO_KIT,
  NOMES_RECEITAS_KIT_CORRIGIDAS,
  candidatasPorLinha,
  migracaoRendimentoKitFeita,
  mensagemMigracaoRendimentoKit,
  selecionarPreparosParaMigrar,
} from '../utils/migracaoRendimentoKit';

const falhou = (r) => !Array.isArray(r) || isErrorResult(r);
const placeholders = (n) => Array.from({ length: n }, () => '?').join(',');

let emVoo = null;

export function migrarRendimentoKit(args) {
  if (emVoo) return emVoo;
  emVoo = _migrar(args).finally(() => { emVoo = null; });
  return emVoo;
}

async function _migrar({ db, user, supabase, avisar }) {
  if (!user?.id || !db) return { status: 'sem_usuario', corrigidos: [] };
  if (migracaoRendimentoKitFeita(user.user_metadata)) return { status: 'ja_feita', corrigidos: [] };

  const nomes = NOMES_RECEITAS_KIT_CORRIGIDAS;
  const preparos = await db.getAllAsync(
    `SELECT id, nome, rendimento_total, unidade_medida FROM preparos WHERE nome IN (${placeholders(nomes.length)})`,
    nomes
  );
  if (falhou(preparos)) return { status: 'erro', corrigidos: [] };

  let corrigidos = [];
  const candidatas = candidatasPorLinha(preparos);
  if (candidatas.length > 0) {
    const ids = candidatas.map(p => p.id);
    const [ingredientes, subpreparos] = await Promise.all([
      db.getAllAsync(
        `SELECT preparo_id, materia_prima_id, quantidade_utilizada FROM preparo_ingredientes WHERE preparo_id IN (${placeholders(ids.length)})`,
        ids
      ),
      db.getAllAsync(
        `SELECT preparo_id, sub_preparo_id FROM preparo_subpreparos WHERE preparo_id IN (${placeholders(ids.length)})`,
        ids
      ),
    ]);
    if (falhou(ingredientes) || falhou(subpreparos)) return { status: 'erro', corrigidos: [] };

    const mpIds = [...new Set(ingredientes.map(i => i.materia_prima_id).filter(x => x != null))];
    let materias = [];
    if (mpIds.length > 0) {
      materias = await db.getAllAsync(
        `SELECT id, nome FROM materias_primas WHERE id IN (${placeholders(mpIds.length)})`,
        mpIds
      );
      if (falhou(materias)) return { status: 'erro', corrigidos: [] };
    }

    const alvo = selecionarPreparosParaMigrar({ preparos: candidatas, ingredientes, materias, subpreparos });
    try {
      for (const p of alvo) {
        // `AND rendimento_total = antigo`: se o usuário editou no meio-tempo, não sobrescreve.
        await db.runAsync(
          'UPDATE preparos SET rendimento_total = ? WHERE id = ? AND rendimento_total = ?',
          [p.novo, p.id, p.antigo]
        );
        corrigidos.push(p);
        // custo_por_kg/custo_total com o rendimento novo + receitas que usam esta + combos.
        // Produtos não guardam custo (calculado na tela); preço de venda não é tocado.
        await cascadeFromPreparo(db, p.id);
      }
    } catch (e) {
      console.warn('[migracaoRendimentoKit] falha ao gravar:', e?.message || e);
      if (corrigidos.length > 0 && avisar) avisar(mensagemMigracaoRendimentoKit(corrigidos));
      return { status: 'erro', corrigidos };
    }
  }

  try {
    const { error } = await supabase.auth.updateUser({ data: { [FLAG_MIGRACAO_RENDIMENTO_KIT]: true } });
    if (error) console.warn('[migracaoRendimentoKit] flag não gravada:', error.message);
  } catch (e) {
    console.warn('[migracaoRendimentoKit] flag não gravada:', e?.message || e);
  }

  if (corrigidos.length > 0 && avisar) avisar(mensagemMigracaoRendimentoKit(corrigidos));
  return { status: 'ok', corrigidos };
}
