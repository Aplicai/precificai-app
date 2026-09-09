import { getDatabase } from '../database/database';

export async function getFinanceiroStatus() {
  const db = await getDatabase();

  // Audit perf: eram 4 queries SEQUENCIAIS de tabela inteira, disparadas a cada
  // mudança de navegação (screenListeners) e pelos banners. Agora: paralelo + COUNT(*).
  let lucroOk = false, faturamentoOk = false, fixasOk = false, variaveisOk = false;
  try {
    const n = (sql) => db.getFirstAsync(sql).then(r => r?.n || 0);
    const [config, fatN, fixasN, variaveisN] = await Promise.all([
      db.getFirstAsync('SELECT * FROM configuracao LIMIT 1'),
      n('SELECT COUNT(*) as n FROM faturamento_mensal WHERE valor > 0'),
      n('SELECT COUNT(*) as n FROM despesas_fixas'),
      n('SELECT COUNT(*) as n FROM despesas_variaveis'),
    ]);
    lucroOk = config != null && config.lucro_desejado > 0;
    faturamentoOk = fatN >= 1;
    fixasOk = fixasN > 0;
    variaveisOk = variaveisN > 0;
  } catch (err) {
    if (__DEV__) console.warn('[financeiroStatus]', err?.message);
  }

  const etapas = [
    { key: 'faturamento', label: 'Faturamento mensal', done: faturamentoOk },
    { key: 'fixas', label: 'Custos do mês', done: fixasOk },
    { key: 'variaveis', label: 'Custos por venda', done: variaveisOk },
    { key: 'lucro', label: 'Margem de lucro', done: lucroOk },
  ];

  const concluidas = etapas.filter(e => e.done).length;
  const completo = concluidas === etapas.length;
  const progresso = concluidas / etapas.length;

  return { etapas, concluidas, total: etapas.length, completo, progresso };
}
