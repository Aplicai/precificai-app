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
  hamburgueria: {
    // Carnes
    'Carne moída bovina': 38.00,
    'Hambúrguer artesanal 150g': 28.00,
    'Frango desfiado': 25.00,
    'Bacon fatiado': 60.00,
    'Calabresa': 35.00,
    // Pães
    'Pão brioche': 18.00,
    'Pão de hambúrguer tradicional': 12.00,
    'Pão australiano': 22.00,
    // Queijos
    'Queijo cheddar fatiado': 45.00,
    'Queijo prato fatiado': 38.00,
    'Queijo mussarela': 42.00,
    'Cream cheese': 35.00,
    // Verduras
    'Alface americana': 8.00,
    'Tomate': 9.00,
    'Cebola roxa': 7.00,
    'Picles': 18.00,
    // Molhos
    'Maionese': 18.00,
    'Catchup': 14.00,
    'Mostarda': 12.00,
    'Molho barbecue': 22.00,
    'Molho ranch': 20.00,
    // Acompanhamentos
    'Batata pré-frita congelada': 15.00,
    'Anel de cebola congelado': 22.00,
    // Embalagens
    'Embalagem hambúrguer': 0.80,
    'Caixa batata frita': 0.50,
    'Sacola delivery': 0.40,
  },
  pizzaria: {
    // Farinhas
    'Farinha de trigo': 6.50,
    'Farinha tipo 00': 12.00,
    'Fermento biológico seco': 22.00,
    // Molhos
    'Molho de tomate': 8.00,
    'Pomarola': 12.00,
    'Polpa de tomate': 10.00,
    // Queijos
    'Mussarela em bolão': 38.00,
    'Mussarela ralada': 42.00,
    'Queijo parmesão ralado': 65.00,
    'Catupiry': 28.00,
    'Requeijão cremoso': 18.00,
    // Embutidos e Frios
    'Calabresa fatiada': 35.00,
    'Presunto fatiado': 32.00,
    'Bacon': 60.00,
    'Pepperoni': 65.00,
    // Vegetais
    'Cebola': 5.50,
    'Tomate': 9.00,
    'Pimentão verde': 8.00,
    'Azeitona preta': 25.00,
    'Champignon': 28.00,
    // Embalagens
    'Caixa pizza grande': 1.80,
    'Caixa pizza média': 1.50,
    'Caixa pizza brotinho': 0.80,
  },
  restaurante: {
    // Grãos
    'Arroz branco': 6.00,
    'Arroz parboilizado': 7.00,
    'Feijão carioca': 9.50,
    'Feijão preto': 10.00,
    // Massas
    'Macarrão espaguete': 5.50,
    'Macarrão parafuso': 6.00,
    // Carnes
    'Patinho': 42.00,
    'Alcatra': 55.00,
    'Acém': 32.00,
    'Frango filé peito': 22.00,
    'Frango sobrecoxa': 12.00,
    'Bisteca suína': 26.00,
    // Peixes
    'Filé de tilápia': 35.00,
    'Salmão': 95.00,
    'Camarão limpo': 80.00,
    // Verduras
    'Cenoura': 5.50,
    'Batata inglesa': 5.00,
    'Cebola': 5.50,
    'Alho': 38.00,
    'Couve manteiga': 6.00,
    // Embalagens
    'Marmita 800ml': 0.90,
    'Talher descartável': 0.15,
  },
  padaria: {
    // Farinhas
    'Farinha de trigo': 6.50,
    'Farinha tipo 1': 7.00,
    'Fermento biológico fresco': 28.00,
    // Açúcares
    'Açúcar refinado': 4.50,
    'Açúcar cristal': 4.20,
    // Laticínios
    'Leite integral': 5.50,
    'Manteiga sem sal': 45.00,
    'Margarina': 14.00,
    // Outros
    'Ovos brancos': 18.00,
    'Sal refinado': 3.00,
    'Óleo de soja': 8.50,
    'Coco ralado': 12.00,
    'Goiabada cremosa': 18.00,
    'Catupiry': 28.00,
    // Recheios
    'Presunto': 32.00,
    'Mussarela': 42.00,
    // Embalagens
    'Saco de pão': 0.10,
    'Sacola alça plástica': 0.20,
  },
  marmitaria: {
    // Praticamente o mesmo que restaurante + embalagens delivery
    'Arroz branco': 6.00,
    'Feijão carioca': 9.50,
    'Patinho': 42.00,
    'Frango filé peito': 22.00,
    'Cebola': 5.50,
    'Alho': 38.00,
    'Cenoura': 5.50,
    'Batata inglesa': 5.00,
    // Embalagens delivery
    'Marmita 800ml descartável': 0.95,
    'Marmita 500ml': 0.65,
    'Sacola plástica grande': 0.25,
    'Talher kit completo': 0.40,
    'Etiqueta lacre': 0.05,
  },
  acai: {
    'Polpa de açaí 1kg': 28.00,
    'Granola tradicional': 22.00,
    'Granola sem açúcar': 32.00,
    'Leite condensado': 8.50,
    'Leite em pó': 38.00,
    'Banana': 4.50,
    'Morango': 18.00,
    'Manga': 7.00,
    'Pasta de amendoim': 18.00,
    'Nutella 350g': 24.00,
    'Granulado de chocolate': 22.00,
    'Confeitos coloridos': 25.00,
    'Mel': 35.00,
    // Embalagens
    'Pote açaí 300ml': 0.50,
    'Pote açaí 500ml': 0.70,
    'Pote açaí 700ml': 0.90,
    'Tampa': 0.20,
    'Colher descartável': 0.15,
  },
  cafeteria: {
    'Café em grãos especial': 65.00,
    'Café tradicional moído': 18.00,
    'Leite integral': 5.50,
    'Leite vegetal de aveia': 18.00,
    'Açúcar refinado': 4.50,
    'Adoçante': 12.00,
    'Calda de chocolate': 18.00,
    'Calda de caramelo': 18.00,
    'Chantilly': 12.00,
    'Chocolate em pó': 15.00,
    // Para snacks
    'Pão para sanduíche': 14.00,
    'Queijo prato': 38.00,
    'Presunto': 32.00,
    // Embalagens
    'Copo descartável 200ml': 0.20,
    'Copo descartável 350ml': 0.35,
    'Tampa': 0.10,
    'Canudo': 0.05,
  },
  sorveteria: {
    'Base sorvete cremoso': 28.00,
    'Base sorvete picolé': 22.00,
    'Açúcar': 4.50,
    'Leite em pó': 38.00,
    'Polpa fruta concentrada': 28.00,
    'Calda chocolate': 18.00,
    'Granulado': 22.00,
    'Castanha picada': 65.00,
    'Wafer': 12.00,
    // Embalagens
    'Casquinha': 0.30,
    'Pote 500ml': 0.80,
    'Pote 1L': 1.20,
    'Palito picolé': 0.05,
    'Saquinho picolé': 0.10,
  },
  salgaderia: {
    'Farinha de trigo': 6.50,
    'Margarina': 14.00,
    'Frango cozido desfiado': 25.00,
    'Carne moída bovina': 38.00,
    'Calabresa': 35.00,
    'Catupiry': 28.00,
    'Mussarela': 42.00,
    'Presunto': 32.00,
    'Ovos': 18.00,
    'Óleo de soja (fritura)': 8.50,
    'Farinha de rosca': 8.00,
    // Embalagens
    'Embalagem coxinha': 0.20,
    'Saquinho papel manteiga': 0.10,
    'Bandeja kraft': 0.50,
  },
  japonesa: {
    'Arroz para sushi': 12.00,
    'Vinagre de arroz': 18.00,
    'Alga nori (10 folhas)': 22.00,
    'Salmão fresco': 95.00,
    'Atum fresco': 110.00,
    'Pepino japonês': 8.00,
    'Cream cheese': 35.00,
    'Cebolinha': 4.00,
    'Gergelim torrado': 28.00,
    'Shoyu': 12.00,
    'Wasabi pasta': 35.00,
    'Gari (gengibre)': 18.00,
    'Macarrão lámen': 8.00,
    'Macarrão yakisoba': 6.00,
    // Embalagens
    'Bandeja sushi 10 peças': 1.20,
    'Hashi descartável': 0.30,
    'Embalagem yakisoba': 0.80,
  },
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
