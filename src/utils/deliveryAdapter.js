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
    cupomR: safe(plataformaRow.desconto_promocao) + safe(plataformaRow.embalagem_extra),
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
      // Audit: match por palavra — "comISSão" e "MEIa-entrega" casavam por substring.
      return /\b(imposto|impostos|icms|iss|issqn|simples|mei|das|tributo|tributos)\b/.test(desc);
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
    cupomR: safe(platRow?.desconto_promocao) + safe(platRow?.embalagem_extra),
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

  return {
    lucroPerc, fixoPerc, impostoPerc, variavelPerc,
    // Margem de segurança (decimal) — protege o CMV no preço sugerido (balcão/delivery/combo).
    margemSegurancaPerc: Number.isFinite(cfg.margem_seguranca) ? cfg.margem_seguranca : 0,
  };
}

/**
 * Embalagem de delivery no produto (design 2026-09-09).
 *
 * O produto leva embalagens extras só no delivery (caixa, marmita, sacola,
 * talher) — ver `embalagensDeliveryDoProduto` pra de onde vem a lista.
 * O custo no delivery é sempre `cmv (balcão) + Σ preço_unitário × quantidade`
 * — a embalagem de balcão (guardanapo, saquinho) costuma ir junto, então NÃO
 * é subtraída. Sem embalagem de delivery → custoDelivery === cmv.
 *
 * @param {object} input
 * @param {number} input.cmv - CMV unitário do balcão (ingredientes + receitas + embalagem balcão)
 * @param {number} [input.embalagemDeliveryPreco] - preco_unitario da embalagem de delivery (0/null = sem)
 * @param {number} [input.embalagemDeliveryQtd] - quantidade (default 1 quando há embalagem)
 * @returns {number} custo unitário no delivery
 */
export function custoDelivery({ cmv, embalagemDeliveryPreco, embalagemDeliveryQtd } = {}) {
  const safe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const preco = Math.max(0, safe(embalagemDeliveryPreco));
  if (preco <= 0) return safe(cmv);
  const qtd = (embalagemDeliveryQtd === null || embalagemDeliveryQtd === undefined || embalagemDeliveryQtd === '')
    ? 1
    : Math.max(0, safe(embalagemDeliveryQtd));
  return safe(cmv) + preco * qtd;
}

/**
 * Lê `produtos.embalagens_delivery` (jsonb): lista `[{ id, qtd }]` das
 * embalagens que vão junto no delivery (marmita + sacola + talher...).
 * Aceita array ou string JSON. Devolve `null` quando a coluna nunca foi
 * gravada ou veio inválida — quem chama cai no par legado.
 */
export function parseEmbalagensDelivery(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  let lista = raw;
  if (typeof raw === 'string') {
    try { lista = JSON.parse(raw); } catch { return null; }
  }
  if (!Array.isArray(lista)) return null;
  return normalizarEmbalagensDelivery(lista) || [];
}

/**
 * Limpa uma lista de embalagens de delivery para gravar/ler: descarta id
 * inválido, não repete embalagem (vale a primeira) e usa quantidade 1 quando
 * ela vem vazia. Devolve `null` para lista vazia (é o que vai para a coluna).
 */
export function normalizarEmbalagensDelivery(itens) {
  if (!Array.isArray(itens)) return null;
  const vistos = new Set();
  const out = [];
  for (const it of itens) {
    const id = Number(it?.id ?? it?.embalagem_id);
    if (!Number.isFinite(id) || id <= 0 || vistos.has(id)) continue;
    const rawQtd = it?.qtd ?? it?.quantidade;
    const num = Number(rawQtd);
    const qtd = (rawQtd === null || rawQtd === undefined || rawQtd === '')
      ? 1
      : (Number.isFinite(num) ? Math.max(0, num) : 1);
    vistos.add(id);
    out.push({ id, qtd });
  }
  return out.length ? out : null;
}

/**
 * Quais embalagens de delivery o produto leva — `[{ id, qtd }]`.
 *
 * A lista (`embalagens_delivery`) é a fonte desde 2026-10; o par legado
 * `embalagem_delivery_id` + `_quantidade` continua gravado com o PRIMEIRO item.
 * O legado vence em dois casos:
 *  - a lista nunca foi gravada (produto salvo antes da mudança);
 *  - o legado aponta pra uma embalagem que não é a primeira da lista — sinal de
 *    que uma aba aberta com a versão antiga do app regravou só o par legado.
 */
export function embalagensDeliveryDoProduto(produto) {
  const legadoId = produto?.embalagem_delivery_id ? Number(produto.embalagem_delivery_id) : null;
  const lista = parseEmbalagensDelivery(produto?.embalagens_delivery);
  const legadoVence = lista === null || (legadoId && (!lista.length || lista[0].id !== legadoId));
  if (!legadoVence) return lista;
  if (!legadoId) return [];
  return normalizarEmbalagensDelivery([{ id: legadoId, qtd: produto.embalagem_delivery_quantidade }]) || [];
}

/**
 * Resolve as embalagens de delivery de uma row de `produtos` contra um mapa
 * `{ [embalagemId]: { preco_unitario, nome } }` (ou array de rows de embalagens).
 *
 * @returns {{ id: number|null, nome: string|null, preco: number, qtd: number, custo: number, itens: Array }}
 *   `custo` = soma de preco × qtd de todas as embalagens (0 quando o produto
 *   não tem embalagem de delivery). Embalagem que não existe mais conta 0.
 *   Com UMA embalagem, `preco`/`qtd` são os dela. Com várias, `preco` = custo
 *   somado e `qtd` = 1, de modo que `preco × qtd` continua sendo o custo total
 *   pra quem repassa os dois a `custoDelivery`. `itens` traz o detalhe por linha.
 */
export function embalagemDeliveryDoProduto(produto, embalagens) {
  const safe = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const refs = embalagensDeliveryDoProduto(produto);
  if (!refs.length) return { id: null, nome: null, preco: 0, qtd: 0, custo: 0, itens: [] };
  const achar = (id) => {
    if (Array.isArray(embalagens)) return embalagens.find((e) => e && Number(e.id) === id) || null;
    if (embalagens && typeof embalagens === 'object') return embalagens[id] || null;
    return null;
  };
  const itens = refs.map(({ id, qtd }) => {
    const emb = achar(id);
    if (!emb) return { id, nome: null, preco: 0, qtd: 0, custo: 0 };
    const preco = Math.max(0, safe(emb.preco_unitario));
    return { id, nome: emb.nome || null, preco, qtd, custo: preco * qtd };
  });
  if (itens.length === 1) return { ...itens[0], itens };
  const custo = itens.reduce((a, i) => a + i.custo, 0);
  const nomes = itens.map((i) => i.nome).filter(Boolean);
  return { id: itens[0].id, nome: nomes.length ? nomes.join(' + ') : null, preco: custo, qtd: 1, custo, itens };
}
