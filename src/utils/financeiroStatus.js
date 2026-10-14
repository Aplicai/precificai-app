import { getDatabase } from '../database/database';
import { rowsOrThrow, countOrThrow } from '../database/dbResult';

/**
 * Regra de "Financeiro completo" (decisão do dono, 10/2026): basta margem de
 * lucro + faturamento mensal. Custos do mês e custos por venda continuam
 * aparecendo como etapas, mas são refinamento (`opcional: true`): nunca
 * seguram banner de erro nem a pendência vermelha da Home.
 *
 * Puro (sem DB) — usado aqui, em `setupStatus.js` e no cálculo inline da
 * Home, pra que os três nunca discordem. Testado em
 * `__tests__/financeiroStatus.test.mjs`.
 */
export function montarStatusFinanceiro({ lucroOk, faturamentoOk, fixasOk, variaveisOk }) {
  const etapas = [
    { key: 'faturamento', label: 'Faturamento mensal', done: !!faturamentoOk },
    { key: 'fixas', label: 'Custos do mês', done: !!fixasOk, opcional: true },
    { key: 'variaveis', label: 'Custos por venda', done: !!variaveisOk, opcional: true },
    { key: 'lucro', label: 'Margem de lucro', done: !!lucroOk },
  ];

  const concluidas = etapas.filter(e => e.done).length;
  // Completo = nenhuma etapa de núcleo pendente (as opcionais não contam).
  const completo = etapas.filter(e => !e.opcional).every(e => e.done);
  // true quando só falta refinamento (custos): vale no máximo uma linha discreta.
  const faltamOpcionais = completo && etapas.some(e => e.opcional && !e.done);
  const progresso = concluidas / etapas.length;

  return { etapas, concluidas, total: etapas.length, completo, faltamOpcionais, progresso };
}

export async function getFinanceiroStatus() {
  const db = await getDatabase();

  // Audit perf: eram 4 queries SEQUENCIAIS de tabela inteira, disparadas a cada
  // mudança de navegação (screenListeners) e pelos banners. Agora: paralelo + COUNT(*).
  // Leitura que falha LANÇA (DbReadError). Antes o catch aqui engolia e devolvia
  // tudo "pendente": o banner "Configuração financeira pendente" aparecia para
  // quem já tinha configurado, só porque a rede oscilou. Quem chama já trata.
  const n = (sql) => countOrThrow(db, sql);
  const [configRows, fatN, fixasN, variaveisN] = await Promise.all([
    db.getAllAsync('SELECT * FROM configuracao LIMIT 1').then(rowsOrThrow),
    n('SELECT COUNT(*) as n FROM faturamento_mensal WHERE valor > 0'),
    n('SELECT COUNT(*) as n FROM despesas_fixas'),
    n('SELECT COUNT(*) as n FROM despesas_variaveis'),
  ]);
  const config = configRows[0] ?? null;

  return montarStatusFinanceiro({
    lucroOk: config != null && config.lucro_desejado > 0,
    faturamentoOk: fatN >= 1,
    fixasOk: fixasN > 0,
    variaveisOk: variaveisN > 0,
  });
}
