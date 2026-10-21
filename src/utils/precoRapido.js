/**
 * Preço rápido (primeiro acesso, 16/10/2026): o preço em ~30 s, sem cadastrar
 * ingredientes. Quatro números que o dono sabe de cabeça:
 *   - quanto custa a receita e quanto ela rende;
 *   - quanto gasta por mês para funcionar e quanto vende por mês;
 *   - (opcional) quanto cobra hoje.
 *
 * A conta é a MESMA do app com o Financeiro preenchido (buildPricingConfig):
 * custos do mês viram % do faturamento, lucro padrão de 15%, markup
 * 1 / (1 − % custos − lucro), preço = custo por unidade × markup. Sem taxas de
 * cartão/app ainda (o Financeiro pede depois).
 *
 * Puro, sem React/RN (testado em __tests__/precoRapido.test.mjs).
 */
import { parseDecimalBR, calcDespesasFixasPercentual, calcMarkup, calcPrecoSugerido } from './calculations';

export const LUCRO_PADRAO = 0.15;

/**
 * Valor digitado → número. Aceita ponto de milhar: aqui os valores são do
 * mês ("8.000", "12.500,00"), e parseDecimalBR sozinho lê "8.000" como 8.
 */
export function parseValorBR(v) {
  if (v === null || v === undefined) return null;
  // Número já calculado (ex.: custo da receita montada): não reler como
  // texto, senão 8.145 casa com o "ponto de milhar" e vira 8145.
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v).replace(/R\$\s*/i, '').trim();
  if (!t) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '');
  const n = parseDecimalBR(t);
  return Number.isFinite(n) ? n : null;
}

const num = parseValorBR;

/**
 * @returns {{ ok, erros, inviavel, custoUnit, fixosPerc, markup, preco,
 *   partes: {custo, gastos, lucro}, comparacao: null|{situacao:'abaixo'|'cobre', hoje, diferenca} }}
 */
export function calcularPrecoRapido({ custoReceita, rendimento, gastoMes, vendaMes, cobraHoje, lucro = LUCRO_PADRAO, taxasPerc = 0, margemSeguranca = 0 }) {
  const custo = num(custoReceita);
  const rend = num(rendimento);
  const gasto = num(gastoMes);
  const venda = num(vendaMes);
  const hoje = num(cobraHoje);

  const erros = {};
  if (!(custo > 0)) erros.custoReceita = 'Diga quanto custa fazer a receita';
  if (!(rend > 0)) erros.rendimento = 'Diga quanto a receita rende';
  if (gasto === null || gasto < 0) erros.gastoMes = 'Diga quanto gasta por mês (pode ser 0)';
  if (!(venda > 0)) erros.vendaMes = 'Diga quanto vende por mês';

  const vazio = { ok: false, erros, inviavel: false, custoUnit: 0, fixosPerc: 0, markup: 0, preco: 0, partes: { custo: 0, seguranca: 0, gastos: 0, taxas: 0, lucro: 0 }, comparacao: null };
  if (Object.keys(erros).length) return vazio;

  const custoUnit = custo / rend;
  const fixosPerc = calcDespesasFixasPercentual(gasto, venda);
  // 2º produto em diante (conta já configurada): mesma conta do app, com as
  // taxas (% sobre a venda) e a margem de segurança do Financeiro.
  const taxas = Number(taxasPerc) > 0 ? Number(taxasPerc) : 0;
  const seguranca = Number(margemSeguranca) > 0 ? Number(margemSeguranca) : 0;
  const markup = calcMarkup(fixosPerc, taxas, lucro);
  if (!(markup > 0)) {
    return { ...vazio, inviavel: true, custoUnit, fixosPerc, erros: { gastoMes: 'Os gastos do mês passam do que você vende: confira os dois valores' } };
  }
  const preco = calcPrecoSugerido(custoUnit, markup, seguranca);
  const comparacao = hoje > 0
    ? { situacao: hoje + 0.005 < preco ? 'abaixo' : 'cobre', hoje, diferenca: preco - hoje }
    : null;

  return {
    ok: true,
    erros: {},
    inviavel: false,
    custoUnit,
    fixosPerc,
    markup,
    preco,
    partes: {
      custo: custoUnit,
      seguranca: custoUnit * seguranca,
      gastos: preco * fixosPerc,
      taxas: preco * taxas,
      lucro: preco * lucro,
    },
    comparacao,
  };
}
