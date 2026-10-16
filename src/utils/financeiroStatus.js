import { getDatabase } from '../database/database';
import { rowsOrThrow, countOrThrow } from '../database/dbResult';

/**
 * Regra de "Financeiro completo" (decisão do dono, 14/10/2026 — reverte 4ca0482):
 * margem de lucro + faturamento mensal + custos do mês + custos por venda.
 * Sem os custos o preço sugerido não fica certo, então nenhuma etapa é
 * opcional: todas seguram o banner e a pendência da Home até serem preenchidas.
 *
 * Puro (sem DB) — usado aqui, em `setupStatus.js` e no cálculo inline da
 * Home, pra que os três nunca discordem. Testado em
 * `__tests__/financeiroStatus.test.mjs`.
 */
export function montarStatusFinanceiro({ lucroOk, faturamentoOk, fixasOk, variaveisOk }) {
  const etapas = [
    { key: 'faturamento', label: 'Faturamento mensal', done: !!faturamentoOk },
    { key: 'fixas', label: 'Custos do mês', done: !!fixasOk },
    { key: 'variaveis', label: 'Custos por venda', done: !!variaveisOk },
    { key: 'lucro', label: 'Margem de lucro', done: !!lucroOk },
  ];

  const concluidas = etapas.filter(e => e.done).length;
  const completo = concluidas === etapas.length;
  const progresso = concluidas / etapas.length;

  return { etapas, concluidas, total: etapas.length, completo, progresso };
}

// Ordem e palavras de quem vende comida (não de contador).
const NOMES_PENDENCIA = [
  ['lucro', 'margem de lucro'],
  ['faturamento', 'quanto entra por mês'],
  ['fixas', 'custos do mês'],
  ['variaveis', 'custos por venda'],
];

/**
 * "Falta: margem de lucro, custos do mês e custos por venda." — '' quando
 * completo ou sem status. Usado nos avisos da Home e no banner.
 */
export function textoPendenciaFinanceiro(status) {
  if (!status?.etapas) return '';
  const faltando = NOMES_PENDENCIA
    .filter(([key]) => status.etapas.find(e => e.key === key)?.done === false)
    .map(([, nome]) => nome);
  if (faltando.length === 0) return '';
  const lista = faltando.length === 1
    ? faltando[0]
    : `${faltando.slice(0, -1).join(', ')} e ${faltando[faltando.length - 1]}`;
  return `Falta: ${lista}.`;
}

// Broadcast do status (module-level store, mesmo padrão de useListDensity):
// o FinanceiroPendenteBanner é global e só lia o status na montagem, então
// continuava "Falta: …" depois de o usuário salvar no Financeiro. Toda leitura
// via getFinanceiroStatus (e a Home, que calcula inline) publica aqui.
const assinantesStatus = new Set();

export function assinarStatusFinanceiro(fn) {
  assinantesStatus.add(fn);
  return () => { assinantesStatus.delete(fn); };
}

export function publicarStatusFinanceiro(status) {
  if (!status?.etapas) return;
  for (const fn of [...assinantesStatus]) {
    try { fn(status); } catch { /* um assinante quebrado não derruba os outros */ }
  }
}

// Leituras simultâneas (salvar no Financeiro + troca de tela + banner) podem
// voltar fora de ordem: uma leitura ANTIGA ("incompleto") que chega depois da
// nova ("completo") não pode ser publicada, senão o aviso volta e fica.
let _ultimaLeitura = 0;
let _ultimaPublicada = 0;

export async function getFinanceiroStatus() {
  const leitura = ++_ultimaLeitura;
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

  const status = montarStatusFinanceiro({
    lucroOk: config != null && config.lucro_desejado > 0,
    faturamentoOk: fatN >= 1,
    fixasOk: fixasN > 0,
    variaveisOk: variaveisN > 0,
  });
  if (leitura > _ultimaPublicada) {
    _ultimaPublicada = leitura;
    publicarStatusFinanceiro(status);
  }
  return status;
}
