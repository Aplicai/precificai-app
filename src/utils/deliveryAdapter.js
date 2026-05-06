/**
 * Adapter delivery — APP-25/29 + sessão 28.30 (normalização legacy)
 *
 * Converte uma row de `delivery_config` (schema legado) para um shape canônico
 * usado pelo engine `calcularPrecoDelivery()` em precificacao.js.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MAPA LEGACY → SEMÂNTICA REAL (origem de bugs em 28.14, 28.23, 28.27)
 *
 *   COLUNA NO DB              SEMÂNTICA REAL              UNIDADE
 *   ────────────────────      ───────────────────────     ─────────
 *   taxa_plataforma           Comissão da plataforma      % (0–100)
 *   comissao_app              Taxa de pagamento online    % (0–100)
 *   desconto_promocao         Cupom de desconto recorrente R$
 *   taxa_entrega              Frete subsidiado recorrente R$
 *   embalagem_extra           [DEPRECATED — não usar]      —
 *   outros_perc               Outras taxas embutidas (28.27) % (0–100)
 *   ativo                     Plataforma ativa             INT 0/1
 *
 * IMPORTANTE: nomes das colunas continuam legacy pra evitar migration
 * destrutiva. Toda nova lógica deve passar por `normalizePlataforma()` que
 * retorna shape com nomes claros (`comissaoPct`, `taxaOnlinePct`, etc).
 * ─────────────────────────────────────────────────────────────────────────
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
 * Sessão 28.30: normalizador canônico de plataforma.
 *
 * Recebe row do `delivery_config` (com nomes legacy confusos) e retorna shape
 * com nomes semânticos. Use em código novo. Telas legadas que ainda lêem
 * `plat.taxa_plataforma` etc continuam funcionando até serem migradas.
 *
 * @param {object} platRow
 * @returns {{
 *   id: number, nome: string, ativo: boolean,
 *   comissaoPct: number,         // decimal 0-1 (era taxa_plataforma)
 *   taxaOnlinePct: number,       // decimal 0-1 (era comissao_app)
 *   outrosPct: number,           // decimal 0-1 (28.27 — outros_perc)
 *   cupomR: number,              // R$ (era desconto_promocao)
 *   freteSubsidiadoR: number,    // R$ (era taxa_entrega)
 * }}
 */
export function normalizePlataforma(platRow) {
  const safe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    id: platRow?.id,
    nome: platRow?.plataforma || platRow?.nome || 'Plataforma',
    ativo: !!platRow?.ativo,
    comissaoPct: safe(platRow?.taxa_plataforma) / 100,
    taxaOnlinePct: safe(platRow?.comissao_app) / 100,
    outrosPct: safe(platRow?.outros_perc) / 100,
    cupomR: safe(platRow?.desconto_promocao),
    freteSubsidiadoR: safe(platRow?.taxa_entrega),
  };
}

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
