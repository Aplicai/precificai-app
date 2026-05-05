/**
 * Fatores de correção (FC) de referência por insumo — D-27/D-28.
 *
 * FC = quantidade_bruta / quantidade_liquida
 * Ex: maracujá com casca 1000g rende 350g de polpa → FC = 1000/350 = 2,857
 *
 * Fonte: Tabela TACO (UNICAMP) + literatura de food cost (SEBRAE, ABRASEL).
 * Aplicado AUTOMATICAMENTE quando o usuário adiciona um insumo via sugestão
 * (kit de início ou autocomplete).
 *
 * Match por substring case-insensitive.
 */

export const FATORES_CORRECAO_REFERENCIA = {
  // Frutas
  'abacaxi': 1.4,           // ~30% perda (casca, miolo)
  'abacate': 1.3,           // ~25% perda (casca, caroço)
  'banana': 1.4,            // ~30% perda (casca)
  'mamão': 1.4,
  'manga': 1.4,
  'maracujá': 2.86,         // ~65% perda (casca)
  'melancia': 1.7,          // ~40% perda (casca)
  'melão': 1.7,
  'morango': 1.05,          // ~5% perda (cabinho)
  'laranja': 1.5,           // ~35% perda (casca)
  'limão': 1.4,
  'tangerina': 1.4,
  'maçã': 1.15,             // ~13% perda (talo, sementes)
  'pera': 1.15,
  'kiwi': 1.2,
  'uva': 1.05,
  'goiaba': 1.2,
  'pêssego': 1.15,
  'coco verde': 3.0,        // 67% perda (casca grossa)
  'coco maduro': 1.5,

  // Verduras e legumes
  'alface': 1.3,
  'rúcula': 1.2,
  'couve': 1.4,
  'espinafre': 1.35,
  'agrião': 1.35,
  'batata inglesa': 1.18,    // 15% perda (casca)
  'batata-inglesa': 1.18,
  'batata doce': 1.2,
  'batata-doce': 1.2,
  'mandioca': 1.4,           // 28% perda (casca grossa)
  'mandioquinha': 1.3,
  'inhame': 1.25,
  'cenoura': 1.15,
  'beterraba': 1.18,
  'pepino': 1.1,
  'tomate': 1.0,             // sem perda significativa
  'cebola': 1.1,
  'cebola roxa': 1.1,
  'alho': 1.15,              // casca
  'pimentão': 1.15,          // sementes
  'abobrinha': 1.05,
  'abóbora': 1.3,            // casca + sementes
  'berinjela': 1.05,
  'chuchu': 1.1,
  'quiabo': 1.05,
  'milho verde': 2.5,        // sabugo
  'ervilha fresca': 2.0,     // vagem
  'vagem': 1.05,

  // Carnes (perda na limpeza/cocção pode somar)
  'frango inteiro': 1.5,     // ~33% perda (osso, pele)
  'frango sobrecoxa com osso': 1.4,
  'frango filé peito': 1.05, // sem perda
  'frango desfiado': 1.0,    // já limpo
  'peito de frango': 1.05,
  'patinho': 1.1,            // 10% perda (gordura)
  'alcatra': 1.08,
  'acém': 1.12,
  'maminha': 1.1,
  'picanha': 1.1,
  'costela bovina': 1.5,     // 33% perda (osso)
  'fraldinha': 1.1,
  'músculo': 1.15,
  'bisteca suína': 1.15,
  'lombo suíno': 1.05,
  'pernil suíno': 1.2,
  // Peixes
  'tilápia inteira': 2.5,    // 60% perda (cabeça, espinha)
  'filé tilápia': 1.05,
  'salmão inteiro': 2.0,
  'salmão filé': 1.05,
  'sardinha inteira': 1.7,
  'camarão com casca': 1.6,  // 38% perda (casca + cabeça)
  'camarão limpo': 1.0,

  // Outros
  'queijo mussarela em peça': 1.05,
  'queijo prato em peça': 1.05,
};

/**
 * Acha FC de referência por nome (case-insensitive, match por substring).
 * Retorna 1 se não encontrou (sem perda).
 */
export function getFatorCorrecaoReferencia(nomeInsumo) {
  if (!nomeInsumo) return 1;
  const norm = String(nomeInsumo).toLowerCase().trim();
  // Match exato primeiro
  if (FATORES_CORRECAO_REFERENCIA[norm] != null) {
    return FATORES_CORRECAO_REFERENCIA[norm];
  }
  // Match por substring (mais específico ganha)
  let best = null;
  let bestLen = 0;
  for (const key of Object.keys(FATORES_CORRECAO_REFERENCIA)) {
    if (norm.includes(key) && key.length > bestLen) {
      best = FATORES_CORRECAO_REFERENCIA[key];
      bestLen = key.length;
    }
  }
  return best != null ? best : 1;
}

/**
 * Calcula quantidade líquida estimada a partir de bruta + nome do insumo.
 * Útil pra pré-preencher o campo quando o usuário só preenche bruta.
 */
export function estimarQuantidadeLiquida(quantidadeBruta, nomeInsumo) {
  const fc = getFatorCorrecaoReferencia(nomeInsumo);
  if (fc <= 1) return quantidadeBruta;
  return Math.round(quantidadeBruta / fc);
}
