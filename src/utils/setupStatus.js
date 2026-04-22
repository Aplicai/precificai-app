import { getDatabase } from '../database/database';

export async function getSetupStatus() {
  const db = await getDatabase();

  // Financeiro
  const configs = await db.getAllAsync('SELECT * FROM configuracao');
  const config = configs?.[0];
  const lucroOk = config != null && config.lucro_desejado != null;
  const fat = await db.getAllAsync('SELECT * FROM faturamento_mensal');
  const faturamentoOk = fat.filter(f => f.valor > 0).length >= 1;
  const fixas = await db.getAllAsync('SELECT * FROM despesas_fixas');
  const fixasOk = fixas.length > 0;
  const variaveis = await db.getAllAsync('SELECT * FROM despesas_variaveis');
  const variaveisOk = variaveis.length > 0;
  const financeiroCompleto = lucroOk && faturamentoOk && fixasOk && variaveisOk;
  const financeiroProgresso = [lucroOk, faturamentoOk, fixasOk, variaveisOk].filter(Boolean).length / 4;

  // Insumos
  const insumos = await db.getAllAsync('SELECT * FROM materias_primas');
  const insumosOk = insumos.length > 0;

  // Embalagens
  const embalagens = await db.getAllAsync('SELECT * FROM embalagens');
  const embalagensOk = embalagens.length > 0;

  // Preparos
  const preparos = await db.getAllAsync('SELECT * FROM preparos');
  const preparosOk = preparos.length > 0;

  // Produtos
  const produtos = await db.getAllAsync('SELECT * FROM produtos');
  const produtosOk = produtos.length > 0;

  // Delivery
  const delProds = await db.getAllAsync('SELECT * FROM delivery_produtos');
  const combos = await db.getAllAsync('SELECT * FROM delivery_combos');
  const deliveryOk = delProds.length > 0 || combos.length > 0;

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
      count: insumos.length,
    },
    {
      key: 'embalagens', label: 'Embalagens', icon: 'package',
      desc: 'Cadastre embalagens e itens de apresentação',
      done: embalagensOk, obrigatoria: false, tab: 'Embalagens',
      count: embalagens.length,
    },
    {
      key: 'preparos', label: 'Preparos', icon: 'layers',
      desc: 'Cadastre receitas base e pré-preparos',
      done: preparosOk, obrigatoria: false, tab: 'Preparos',
      count: preparos.length,
    },
    {
      key: 'produtos', label: 'Produtos', icon: 'box',
      desc: 'Monte fichas técnicas e defina preços',
      done: produtosOk, obrigatoria: false, tab: 'Produtos',
      count: produtos.length,
    },
    {
      key: 'delivery', label: 'Delivery', icon: 'truck',
      desc: 'Configure plataformas e preços de delivery',
      done: deliveryOk, obrigatoria: false, tab: 'Delivery',
      count: delProds.length + combos.length,
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
  };
}
