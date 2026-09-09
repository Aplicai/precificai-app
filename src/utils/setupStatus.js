import { getDatabase } from '../database/database';

/**
 * UX audit 09/09 (Fase B, item 16): a barra "Configuração do app 83% —
 * Próxima: Delivery" ficava na Home pra sempre pra quem não usa delivery.
 *
 * Retorna true quando NÃO há etapa pendente que valha um banner: ou está
 * tudo concluído, ou só faltam etapas marcadas `opcional: true`
 * (Embalagens, Preparos, Delivery). Etapas sem flag (Insumos, Produtos)
 * e `obrigatoria: true` (Financeiro) contam como núcleo.
 * Puro (sem DB) — testado em `__tests__/setupStatus.test.mjs`.
 */
export function soFaltamEtapasOpcionais(etapas) {
  if (!Array.isArray(etapas)) return true;
  return etapas.filter(e => e && !e.done).every(e => e.opcional === true);
}

export async function getSetupStatus() {
  const db = await getDatabase();

  // Audit perf: eram 10 queries SEQUENCIAIS trazendo tabelas INTEIRAS só p/
  // `.length` (com 2.400 insumos, MBs por chamada — e esta função roda no boot
  // e a cada mudança de navegação). Agora: paralelo + COUNT(*).
  const n = (sql) => db.getFirstAsync(sql).then(r => r?.n || 0);
  const [config, fatOkN, fixasN, variaveisN, insumosN, embalagensN, preparosN, produtosN, delProdsN, combosN] = await Promise.all([
    db.getFirstAsync('SELECT * FROM configuracao LIMIT 1'),
    n('SELECT COUNT(*) as n FROM faturamento_mensal WHERE valor > 0'),
    n('SELECT COUNT(*) as n FROM despesas_fixas'),
    n('SELECT COUNT(*) as n FROM despesas_variaveis'),
    n('SELECT COUNT(*) as n FROM materias_primas'),
    n('SELECT COUNT(*) as n FROM embalagens'),
    n('SELECT COUNT(*) as n FROM preparos'),
    n('SELECT COUNT(*) as n FROM produtos'),
    n('SELECT COUNT(*) as n FROM delivery_produtos'),
    n('SELECT COUNT(*) as n FROM delivery_combos'),
  ]);

  const lucroOk = config != null && config.lucro_desejado != null;
  const faturamentoOk = fatOkN >= 1;
  const fixasOk = fixasN > 0;
  const variaveisOk = variaveisN > 0;
  const financeiroCompleto = lucroOk && faturamentoOk && fixasOk && variaveisOk;
  const financeiroProgresso = [lucroOk, faturamentoOk, fixasOk, variaveisOk].filter(Boolean).length / 4;

  const insumosOk = insumosN > 0;
  const embalagensOk = embalagensN > 0;
  const preparosOk = preparosN > 0;
  const produtosOk = produtosN > 0;
  const deliveryOk = delProdsN > 0 || combosN > 0;

  const etapas = [
    {
      key: 'financeiro', label: 'Financeiro', icon: 'dollar-sign',
      desc: 'Configure markup, despesas e margem de lucro',
      done: financeiroCompleto, obrigatoria: true, tab: 'Financeiro',
      progresso: financeiroProgresso,
      detalhes: [
        { label: 'Margem de lucro', done: lucroOk },
        { label: 'Faturamento', done: faturamentoOk },
        { label: 'Custos do mês', done: fixasOk },
        { label: 'Custos por venda', done: variaveisOk },
      ],
    },
    {
      key: 'insumos', label: 'Insumos', icon: 'shopping-bag',
      desc: 'Cadastre suas matérias-primas e ingredientes',
      done: insumosOk, obrigatoria: false, tab: 'Insumos',
      count: insumosN,
    },
    {
      key: 'embalagens', label: 'Embalagens', icon: 'package',
      desc: 'Cadastre embalagens e itens de apresentação',
      done: embalagensOk, obrigatoria: false, opcional: true, tab: 'Embalagens',
      count: embalagensN,
    },
    {
      key: 'preparos', label: 'Preparos', icon: 'layers',
      desc: 'Cadastre receitas base e pré-preparos',
      done: preparosOk, obrigatoria: false, opcional: true, tab: 'Preparos',
      count: preparosN,
    },
    {
      key: 'produtos', label: 'Produtos', icon: 'box',
      desc: 'Monte fichas técnicas e defina preços',
      done: produtosOk, obrigatoria: false, tab: 'Produtos',
      count: produtosN,
    },
    {
      key: 'delivery', label: 'Delivery', icon: 'truck',
      desc: 'Configure plataformas e preços de delivery',
      done: deliveryOk, obrigatoria: false, opcional: true, tab: 'Delivery',
      count: delProdsN + combosN,
    },
  ];

  const concluidas = etapas.filter(e => e.done).length;
  const total = etapas.length;
  const completo = concluidas === total;
  const progresso = concluidas / total;
  const proximaEtapa = etapas.find(e => !e.done) || null;

  return {
    etapas,
    concluidas,
    total,
    completo,
    progresso,
    proximaEtapa,
    financeiroCompleto,
    // true = não vale mostrar banner de progresso (só opcionais pendentes).
    soFaltamOpcionais: soFaltamEtapasOpcionais(etapas),
  };
}
