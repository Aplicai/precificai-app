/**
 * Preços de referência por segmento — APP-14
 *
 * Tabela de preços médios de mercado (BRL) usados pra pré-preencher os
 * insumos do Kit de Início. Esses valores são ESTIMATIVAS médias do
 * varejo brasileiro, servem como ponto de partida pra usuária não ter
 * que pesquisar tudo do zero.
 *
 * IMPORTANTE: o usuário deve ajustar pro seu preço real. A UI mostra um
 * badge "Valor estimado — atualize com seu preço real" pra deixar claro.
 *
 * Fontes consultadas (médias agregadas, não fontes oficiais):
 *  - Tabelas de food cost (SEBRAE, ABRASEL)
 *  - Pesquisas de varejo (Procon-SP, IBGE Sistema de Preços ao Consumidor)
 *  - Atacadistas online (Atacadão, Assaí, Tenda Atacado) — médias 2025-2026
 *
 * Estrutura: { 'Nome exato do insumo no template': preco_em_BRL_pela_quantidade_bruta }
 *
 * Os valores são pela QUANTIDADE BRUTA definida em templates.js (não por kg).
 * Ex: "Farinha de trigo": 6.50 = R$ 6,50 por 1 kg (já que qtd_bruta = 1000g).
 */

export const PRECOS_REFERENCIA_POR_SEGMENTO = {
  confeitaria: {
    // Farinhas e Amidos (qtd_bruta em g/ml conforme template)
    'Farinha de trigo': 6.50,
    'Farinha de trigo com fermento': 7.50,
    'Farinha de rosca': 8.00,
    'Amido de milho (Maizena)': 12.00,
    'Polvilho doce': 10.00,
    'Polvilho azedo': 11.00,
    'Farinha de amêndoas': 65.00,
    'Farinha de coco': 28.00,
    'Aveia em flocos': 15.00,

    // Açúcares e Adoçantes
    'Açúcar refinado': 4.50,
    'Açúcar cristal': 4.20,
    'Açúcar mascavo': 12.00,
    'Açúcar demerara': 10.00,
    'Açúcar de confeiteiro': 8.50,
    'Mel': 35.00,
    'Glucose de milho': 15.00,
    'Leite condensado': 8.50,
    'Leite condensado light': 10.00,

    // Chocolates e Cacau
    'Chocolate ao leite': 65.00,
    'Chocolate meio amargo': 70.00,
    'Chocolate branco': 68.00,
    'Cacau em pó': 45.00,
    'Achocolatado em pó': 18.00,
    'Granulado de chocolate': 22.00,
    'Confeitos coloridos': 25.00,

    // Laticínios
    'Leite integral': 5.50,
    'Leite desnatado': 5.80,
    'Creme de leite': 7.50,
    'Leite em pó': 38.00,
    'Manteiga sem sal': 45.00,
    'Manteiga com sal': 42.00,
    'Margarina culinária': 18.00,
    'Cream cheese': 18.00,
    'Iogurte natural': 6.00,
    'Queijo mascarpone': 35.00,

    // Ovos
    'Ovos brancos': 18.00,
    'Ovos vermelhos': 20.00,
    'Claras pasteurizadas': 22.00,
    'Gemas pasteurizadas': 28.00,

    // Gorduras
    'Óleo de soja': 8.50,
    'Óleo de canola': 12.00,
    'Óleo de coco': 35.00,

    // Fermentos
    'Fermento químico': 12.00,
    'Bicarbonato de sódio': 8.00,

    // Espessantes e Gelificantes
    'Gelatina em pó sem sabor': 28.00,
    'Gelatina em folha': 18.00,
    'Ágar-ágar': 35.00,

    // Aromas e Essências
    'Essência de baunilha': 15.00,
    'Extrato de baunilha': 28.00,
    'Essência de amêndoas': 12.00,
    'Essência de rum': 12.00,
    'Pasta de baunilha': 95.00,

    // Frutas
    'Morango fresco': 18.00,
    'Maracujá': 8.00,
    'Limão': 6.00,
    'Laranja': 5.50,
    'Abacaxi': 8.00,
    'Banana': 4.50,
    'Maçã': 7.00,
    'Coco ralado': 12.00,
    'Polpa de fruta congelada': 18.00,

    // Nozes e Sementes
    'Castanha de caju': 75.00,
    'Castanha do Pará': 80.00,
    'Nozes': 95.00,
    'Amêndoas': 85.00,
    'Avelãs': 90.00,
    'Pistache': 180.00,
    'Coco em flocos': 18.00,
  },
  // Demais segmentos podem ser adicionados conforme demanda.
  // Por enquanto só confeitaria está mapeada (kit de início é o principal).
  hamburgueria: {},
  pizzaria: {},
  restaurante: {},
  padaria: {},
  marmitaria: {},
  acai: {},
  cafeteria: {},
  sorveteria: {},
  salgaderia: {},
  japonesa: {},
};

/**
 * Retorna o preço de referência de um insumo, ou null se não houver.
 */
export function getPrecoReferencia(segmento, nomeInsumo) {
  const tabela = PRECOS_REFERENCIA_POR_SEGMENTO[segmento];
  if (!tabela) return null;
  const preco = tabela[nomeInsumo];
  return typeof preco === 'number' && preco > 0 ? preco : null;
}
