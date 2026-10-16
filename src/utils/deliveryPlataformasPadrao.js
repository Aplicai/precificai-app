/**
 * Plataformas de delivery conhecidas e as taxas padrão de mercado (2025-2026).
 *
 * Fonte única usada ao CRIAR uma plataforma — seja pela semente inicial
 * (DeliveryPlataformasScreen), seja pelo "Adicionar plataforma" da aba
 * Plataformas do Delivery (DeliveryHubScreen). Antes o Hub gravava 0% de
 * comissão e 0% de taxa mesmo ao adicionar "iFood".
 *
 * Semântica das colunas de delivery_config (ver deliveryAdapter.js):
 *   taxa_plataforma   (%)  = Comissão da plataforma
 *   comissao_app      (%)  = Taxa de pagamento online
 *   desconto_promocao (R$) = Cupom de desconto recorrente
 *   taxa_entrega      (R$) = Frete subsidiado recorrente
 */

export const PLATAFORMAS_PADRAO = Object.freeze([
  { plataforma: 'iFood', taxa_plataforma: 27, taxa_entrega: 0, comissao_app: 3.2, desconto_promocao: 0, ativo: 1 },
  { plataforma: 'Rappi', taxa_plataforma: 25, taxa_entrega: 0, comissao_app: 3, desconto_promocao: 0, ativo: 1 },
  { plataforma: '99Food', taxa_plataforma: 22, taxa_entrega: 0, comissao_app: 3, desconto_promocao: 0, ativo: 1 },
  { plataforma: 'Uber Eats', taxa_plataforma: 30, taxa_entrega: 0, comissao_app: 3, desconto_promocao: 0, ativo: 1 },
  { plataforma: 'Site Próprio / WhatsApp', taxa_plataforma: 0, taxa_entrega: 0, comissao_app: 0, desconto_promocao: 0, ativo: 1 },
]);

const SEM_TAXAS = Object.freeze({ taxa_plataforma: 0, taxa_entrega: 0, comissao_app: 0, desconto_promocao: 0 });

const compacto = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, '');

/**
 * Plataforma conhecida que casa com o nome digitado (ou null).
 * Casa pelo nome inteiro ("Uber Eats") ou pela primeira palavra ("Uber",
 * "iFood Loja 2"), ignorando maiúsculas, acentos e espaços ("i food").
 */
export function plataformaPadraoPorNome(nome) {
  const n = compacto(nome);
  if (!n) return null;
  return PLATAFORMAS_PADRAO.find((p) => {
    const cheio = compacto(p.plataforma);
    const primeira = compacto(String(p.plataforma).split(' ')[0]);
    return n === cheio || n.includes(primeira);
  }) || null;
}

/** Taxas para gravar ao criar a plataforma `nome` (zeros quando desconhecida). */
export function taxasPadraoDaPlataforma(nome) {
  const p = plataformaPadraoPorNome(nome);
  if (!p) return { ...SEM_TAXAS };
  return {
    taxa_plataforma: p.taxa_plataforma,
    taxa_entrega: p.taxa_entrega,
    comissao_app: p.comissao_app,
    desconto_promocao: p.desconto_promocao,
  };
}
