import { getDatabase } from '../database/database';

export async function getFinanceiroStatus() {
  const db = await getDatabase();

  let lucroOk = false;
  let configData = null;
  try {
    const configs = await db.getAllAsync('SELECT * FROM configuracao');
    configData = configs?.[0];
    // Lucro only counts as configured if user explicitly set it (0.15 is the trigger default)
    lucroOk = configData != null && configData.lucro_desejado > 0 && configData.lucro_desejado !== 0.15;
  } catch (err) {
    console.warn('Error checking config:', err.message);
  }

  let faturamentoOk = false;
  try {
    const fat = await db.getAllAsync('SELECT * FROM faturamento_mensal');
    const mesesPreenchidos = fat.filter(f => f.valor > 0).length;
    faturamentoOk = mesesPreenchidos >= 1;
  } catch (err) {
    console.warn('Error checking faturamento:', err.message);
  }

  let fixasOk = false;
  try {
    const fixas = await db.getAllAsync('SELECT * FROM despesas_fixas');
    fixasOk = fixas.length > 0;
  } catch (err) {
    console.warn('Error checking fixas:', err.message);
  }

  let variaveisOk = false;
  try {
    const variaveis = await db.getAllAsync('SELECT * FROM despesas_variaveis');
    variaveisOk = variaveis.length > 0;
  } catch (err) {
    console.warn('Error checking variaveis:', err.message);
  }

  const etapas = [
    { key: 'faturamento', label: 'Faturamento mensal', done: faturamentoOk },
    { key: 'fixas', label: 'Despesas fixas', done: fixasOk },
    { key: 'variaveis', label: 'Despesas variáveis', done: variaveisOk },
    { key: 'lucro', label: 'Margem de lucro', done: lucroOk },
  ];

  const concluidas = etapas.filter(e => e.done).length;
  const completo = concluidas === etapas.length;
  const progresso = concluidas / etapas.length;

  return { etapas, concluidas, total: etapas.length, completo, progresso };
}
