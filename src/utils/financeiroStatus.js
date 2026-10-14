import { getDatabase } from '../database/database';
import { rowsOrThrow, countOrThrow } from '../database/dbResult';

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
  const lucroOk = config != null && config.lucro_desejado > 0;
  const faturamentoOk = fatN >= 1;
  const fixasOk = fixasN > 0;
  const variaveisOk = variaveisN > 0;

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
