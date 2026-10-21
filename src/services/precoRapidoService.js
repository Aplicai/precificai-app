/**
 * Grava o Preço rápido (src/utils/precoRapido.js):
 *   1. Financeiro, só onde está vazio: configuracao (lucro 15%), as vendas do
 *      mês nos 12 meses (como o assistente do Financeiro faz) e uma despesa
 *      fixa "Gastos do mês (estimativa)". O que a pessoa já preencheu fica.
 *   2. Um ingrediente "Receita do X (custo estimado)" em unidade, com o custo
 *      da receita inteira, ligado ao produto com quantidade 1. Assim o custo
 *      do produto bate em todas as telas; trocar pelos ingredientes reais
 *      deixa o custo exato.
 *   3. O produto, vendido por unidade, com o preço calculado.
 *
 * SQL igual ao do Financeiro (FinanceiroConfigScreen) e dos formulários de
 * ingrediente/produto. Sem transação no wrapper: se o produto falha, apaga o
 * ingrediente criado. O Financeiro gravado fica (é dado válido da pessoa).
 */
import { calcularPrecoRapido, parseValorBR, LUCRO_PADRAO } from '../utils/precoRapido';

export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

async function linhas(db, sql) {
  const r = await db.getAllAsync(sql);
  return Array.isArray(r) ? r : [];
}

/**
 * Financeiro só onde está vazio: configuracao (lucro 15%), as vendas do mês
 * nos 12 meses e a despesa fixa "Gastos do mês (estimativa)". O que a pessoa
 * já preencheu fica. Usado pelo Preço rápido e pela receita montada.
 */
export async function garantirFinanceiro(db, { vendaMes, gastoMes }) {
  const cfgs = await linhas(db, 'SELECT * FROM configuracao');
  if (cfgs.length === 0) {
    await db.runAsync(`INSERT INTO configuracao (lucro_desejado, margem_seguranca) VALUES (${LUCRO_PADRAO}, 0)`);
  }
  const fat = await linhas(db, 'SELECT * FROM faturamento_mensal ORDER BY id');
  if (fat.length === 0) {
    for (const mes of MESES) {
      await db.runAsync('INSERT INTO faturamento_mensal (mes, valor) VALUES (?, ?)', [mes, vendaMes]);
    }
  } else if (fat.every((f) => !(Number(f.valor) > 0))) {
    for (const f of fat) {
      await db.runAsync('UPDATE faturamento_mensal SET valor = ? WHERE id = ?', [vendaMes, f.id]);
    }
  }
  const fixas = await linhas(db, 'SELECT * FROM despesas_fixas');
  if (fixas.length === 0 && gastoMes > 0) {
    await db.runAsync('INSERT INTO despesas_fixas (descricao, valor) VALUES (?, ?)', ['Gastos do mês (estimativa)', gastoMes]);
  }
}

export async function salvarPrecoRapido(db, entrada) {
  const nome = String(entrada?.nome || '').trim();
  const calc = calcularPrecoRapido(entrada || {});
  if (!nome) throw new Error('Produto sem nome');
  if (!calc.ok) throw new Error('Preço rápido incompleto');

  const custoReceita = parseValorBR(entrada.custoReceita);
  const rendimento = parseValorBR(entrada.rendimento);
  const vendaMes = parseValorBR(entrada.vendaMes);
  const gastoMes = parseValorBR(entrada.gastoMes);
  const preco = Math.round(calc.preco * 100) / 100;

  // 1. Financeiro onde estiver vazio
  await garantirFinanceiro(db, { vendaMes, gastoMes });

  // 2 e 3. Custo estimado + produto
  let materiaId = null;
  let produtoId = null;
  try {
    const mp = await db.runAsync(
      'INSERT INTO materias_primas (nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES (?,?,?,?,?,?,?,?,?)',
      [`Receita do ${nome} (custo estimado)`, '', null, 1, 1, 1, 'un', custoReceita, custoReceita]
    );
    materiaId = mp?.lastInsertRowId;
    if (!materiaId) throw new Error('Custo estimado não foi salvo');

    const pr = await db.runAsync(
      `INSERT INTO produtos (nome, categoria_id, rendimento_total, unidade_rendimento, rendimento_unidades,
       tempo_preparo, preco_venda, margem_lucro_produto, validade_dias, temp_congelado, tempo_congelado,
       temp_refrigerado, tempo_refrigerado, temp_ambiente, tempo_ambiente,
       modo_preparo, observacoes, embalagem_delivery_id, embalagem_delivery_quantidade, embalagens_delivery) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        nome, null, 1, 'por_unidade', rendimento,
        0, preco, 0, 0, 0, 0,
        0, 0, 0, 0,
        '', '',
        null, null, null,
      ]
    );
    produtoId = pr?.lastInsertRowId;
    if (!produtoId) throw new Error('Produto não foi salvo');

    await db.runAsync(
      'INSERT INTO produto_ingredientes (produto_id, materia_prima_id, quantidade_utilizada) VALUES (?,?,?)',
      [produtoId, materiaId, 1]
    );
  } catch (e) {
    if (produtoId) { try { await db.runAsync('DELETE FROM produtos WHERE id = ?', [produtoId]); } catch (_) {} }
    if (materiaId) { try { await db.runAsync('DELETE FROM materias_primas WHERE id = ?', [materiaId]); } catch (_) {} }
    throw e;
  }

  return { produtoId, materiaId, preco };
}
