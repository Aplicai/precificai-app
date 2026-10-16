import { classificarMargem } from './margemMeta';

/**
 * Indicadores de "Saúde da Precificação" da Home (funções puras).
 *
 * Antes o veredito ("Operação saudável") era decidido por uma cadeia própria
 * e os cards por outra: dava "Operação saudável" com o card de CMV vermelho e
 * o insight "Ingredientes pesando no preço" logo abaixo. Agora os cards, o
 * veredito e os insights leem as MESMAS cores daqui.
 *
 * Cada indicador: 'green' | 'yellow' | 'red' | null (null = sem dados para
 * julgar; o card mostra "--" e não entra no veredito).
 *
 * Testado em `__tests__/painelSaude.test.mjs`.
 */

export const CMV_META_PADRAO = 0.35;

const COR_DA_FAIXA = { acima: 'green', medio: 'yellow', abaixo: 'red' };

/**
 * @param {object} p
 * @param {boolean} p.pendente         - Financeiro incompleto (sem margem, faturamento ou custos)
 * @param {number}  p.prodsComPreco    - produtos com preço de venda > 0
 * @param {number}  p.custoComPreco    - soma do custo unitário desses produtos
 * @param {number}  p.cmvPercent       - CMV médio (decimal)
 * @param {number}  p.cmvMeta          - meta de CMV (decimal)
 * @param {number}  p.margemMedia      - "quanto sobra por venda" médio (decimal)
 * @param {number}  p.margemMeta       - meta de margem (decimal, lucro_desejado)
 * @param {number}  p.sobraMes         - "Sobra do mês" (R$)
 * @param {number}  p.fatMedio         - faturamento médio (R$)
 * @param {number}  p.pontoEquilibrio  - mínimo pra pagar as contas (R$)
 */
export function avaliarIndicadores(p) {
  const temPreco = (p.prodsComPreco || 0) > 0;
  // Sem custo nenhum (ingredientes sem preço) o CMV daria 0% "verde": não julga.
  const temCusto = temPreco && (p.custoComPreco || 0) > 0;
  const cmvAlvo = p.cmvMeta > 0 ? p.cmvMeta : CMV_META_PADRAO;
  const cmvPercent = Number(p.cmvPercent) || 0;
  const cmv = !temCusto ? null
    : cmvPercent < cmvAlvo ? 'green'
    : cmvPercent <= cmvAlvo + 0.05 ? 'yellow'
    : 'red';

  // Sobra, mínimo e margem dependem do Financeiro E de produto com preço
  // (sem preço o CMV fica de fora e os números saem otimistas demais).
  const julgaFinanceiro = !p.pendente && temPreco;
  const fat = Number(p.fatMedio) || 0;
  const sobraMes = Number(p.sobraMes) || 0;
  const pe = Number(p.pontoEquilibrio) || 0;

  const sobra = !julgaFinanceiro ? null
    : sobraMes > 0 ? (fat > 0 && sobraMes / fat < 0.10 ? 'yellow' : 'green')
    : 'red';
  const minimo = !julgaFinanceiro || !(fat > 0) || !(pe > 0) ? null
    : fat >= pe * 1.2 ? 'green'
    : fat >= pe ? 'yellow'
    : 'red';
  const faixa = julgaFinanceiro ? classificarMargem(p.margemMedia, p.margemMeta) : null;
  const margem = faixa ? COR_DA_FAIXA[faixa] : null;

  return { cmv, sobra, minimo, margem };
}

// Ordem de gravidade: faltar dinheiro no mês vem antes de ingrediente caro.
const ORDEM_ALERTA = ['sobra', 'minimo', 'cmv', 'margem'];

/** Primeiro indicador vermelho (ou null). O veredito nunca é "saudável" com um deles. */
export function indicadorEmAlerta(ind) {
  if (!ind) return null;
  return ORDEM_ALERTA.find(k => ind[k] === 'red') || null;
}
