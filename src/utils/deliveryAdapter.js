/**
 * Adapter delivery — APP-25/29
 *
 * Converte uma row de `delivery_config` (schema legado) para o formato
 * esperado pelo `calcularPrecoDelivery()` do precificacao.js engine.
 *
 * Schema delivery_config (REPURPOSED — sem migration):
 *   - taxa_plataforma  (REAL %)  → Comissão da plataforma
 *   - comissao_app     (REAL %)  → Taxa de pagamento online
 *   - desconto_promocao(REAL R$) → Cupom recorrente
 *   - taxa_entrega     (REAL R$) → Frete subsidiado recorrente
 *   - ativo            (INT 0/1)
 *
 * Os campos de %  estão armazenados como 0-100 no DB (ex: 27 = 27%).
 * O engine espera DECIMAL (0.27 = 27%), então convertemos /100 aqui.
 */

import { calcularPrecoDelivery, compararDeliveryVsBalcao } from './precificacao';

/**
 * Extrai params delivery a partir de uma row delivery_config.
 *
 * @param {object} plataformaRow - linha da tabela delivery_config
 * @param {object} contextoFinanceiro - { lucroPerc, fixoPerc, impostoPerc }
 *   - lucroPerc/fixoPerc/impostoPerc são DECIMAIS (0.15, 0.226, 0.04)
 *   - impostoPerc vem do agregado de despesas_variaveis (filtrar maquininha
 *     fora do delivery, mas hoje pegamos o total por simplicidade)
 *
 * @returns {object} params prontos pra passar pra calcularPrecoDelivery
 */
export function plataformaParaParamsDelivery(plataformaRow, contextoFinanceiro) {
  const safe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    lucroPerc: safe(contextoFinanceiro.lucroPerc),
    fixoPerc: safe(contextoFinanceiro.fixoPerc),
    impostoPerc: safe(contextoFinanceiro.impostoPerc),
    comissaoPerc: safe(plataformaRow.taxa_plataforma) / 100,
    taxaPagamentoOnlinePerc: safe(plataformaRow.comissao_app) / 100,
    cupomR: safe(plataformaRow.desconto_promocao),
    freteSubsidiadoR: safe(plataformaRow.taxa_entrega),
  };
}

/**
 * Calcula preço delivery pra um produto numa plataforma específica.
 *
 * @param {number} cmv - CMV do produto em R$
 * @param {object} plataformaRow
 * @param {object} contextoFinanceiro - ver plataformaParaParamsDelivery
 * @returns {object} resultado de calcularPrecoDelivery
 */
export function calcularPrecoDeliveryPlataforma(cmv, plataformaRow, contextoFinanceiro) {
  const params = plataformaParaParamsDelivery(plataformaRow, contextoFinanceiro);
  return calcularPrecoDelivery({ cmv, ...params });
}

/**
 * Helper: extrai imposto% das despesas_variaveis cadastradas.
 *
 * No delivery, imposto continua mas maquininha não. Este helper tenta
 * separar — se a descrição contém "imposto", "ICMS", "ISS", soma.
 *
 * @param {Array} despesasVariaveis - rows de despesas_variaveis (percentual em decimal 0-1)
 * @returns {number} imposto em decimal
 */
export function extrairImpostoPercentual(despesasVariaveis) {
  if (!Array.isArray(despesasVariaveis)) return 0;
  return despesasVariaveis
    .filter((d) => {
      const desc = String(d.descricao || '').toLowerCase();
      return desc.includes('imposto') || desc.includes('icms') || desc.includes('iss') || desc.includes('simples') || desc.includes('mei');
    })
    .reduce((acc, d) => acc + (Number.isFinite(d.percentual) ? d.percentual : 0), 0);
}

export { compararDeliveryVsBalcao };

/**
 * Sessão 28.25 (refactor): builder canônico do "contexto financeiro" usado em
 * SimuladorLoteScreen, SimulacaoProdutoScreen, DeliveryHubScreen, DeliveryPrecosScreen
 * e DeliveryCombosScreen. Antes, cada tela replicava ~10 linhas de cálculo
 * idêntico — risco de drift quando uma é mudada.
 *
 * @param {object} input
 * @param {Array}  input.cfgRows     - rows de `configuracao` (geralmente [{lucro_desejado, lucro_desejado_delivery, ...}])
 * @param {Array}  input.fixasRows   - rows de `despesas_fixas` (cada uma com `valor`)
 * @param {Array}  input.varsRows    - rows de `despesas_variaveis` ({descricao, percentual em decimal})
 * @param {Array}  input.fatRows     - rows de `faturamento_mensal` ({valor})
 * @param {object} [input.options]
 * @param {boolean}[input.options.usarLucroDelivery] - true → usa lucro_desejado_delivery; false → lucro_desejado balcão
 * @returns {{ lucroPerc:number, fixoPerc:number, impostoPerc:number, variavelPerc:number }}
 */
export function buildContextoFinanceiro({ cfgRows, fixasRows, varsRows, fatRows, options = {} }) {
  const safe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const cfg = (cfgRows && cfgRows[0]) || {};

  // Soma fixas e divide por faturamento médio pra obter %
  const totalFixas = (fixasRows || []).reduce((a, r) => a + safe(r.valor), 0);
  const fatLista = (fatRows || []).filter((r) => safe(r.valor) > 0);
  const fatMedio = fatLista.length > 0
    ? fatLista.reduce((a, r) => a + safe(r.valor), 0) / fatLista.length
    : 0;
  const fixoPerc = fatMedio > 0 ? totalFixas / fatMedio : 0;

  // Lucro desejado (delivery tem campo separado opcional)
  const lucroPerc = options.usarLucroDelivery
    ? (Number.isFinite(cfg.lucro_desejado_delivery) ? cfg.lucro_desejado_delivery
       : Number.isFinite(cfg.lucro_desejado) ? cfg.lucro_desejado : 0.15)
    : (Number.isFinite(cfg.lucro_desejado) ? cfg.lucro_desejado : 0.15);

  const impostoPerc = extrairImpostoPercentual(varsRows || []);
  const variavelPerc = (varsRows || []).reduce(
    (a, d) => a + (Number.isFinite(d.percentual) ? d.percentual : 0),
    0
  );

  return { lucroPerc, fixoPerc, impostoPerc, variavelPerc };
}
