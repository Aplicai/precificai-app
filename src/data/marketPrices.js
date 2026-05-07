/**
 * Sessão 28.34: base curada de PREÇOS DE MERCADO de insumos comuns no varejo
 * brasileiro (atacarejo + supermercado médio porte). Atualizado em
 * novembro/2025 — usuário deve revisar localmente, são valores REFERÊNCIA.
 *
 * Usado em:
 *   - KitInicioScreen.executarKit → preenche `valor_pago` ao aplicar kit
 *   - MateriaPrimaForm autocomplete → sugere preço ao pickar do dicionário
 *
 * SHAPE: cada entrada tem `valor_pago` em R$ correspondente à `quantidade_bruta`
 * em `unidade_medida` (mesmo shape do INSUMOS_POR_SEGMENTO em templates.js).
 *
 * MATCHING: feito por nome NORMALIZADO (lowercase, sem acentos, trim). Variações
 * comuns são listadas como aliases.
 *
 * REGRA DE OURO: preferimos NÃO ter preço a ter preço errado. Itens que não
 * estão aqui caem no default valor_pago=0 do template (user vê "estimar"
 * e pode preencher).
 */

function _norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/**
 * Map nome normalizado → { valor_pago, qty, unidade }.
 * - valor_pago: R$ pra QTY na UNIDADE específica (matches o template default).
 * - Se no template a quantidade for diferente, escalonamos proporcional.
 */
const PRICES = {
  // ── FARINHAS E AMIDOS ─────────────────────────────────────────────────
  'farinha de trigo':                    { valor: 5.50, qty: 1000, unidade: 'kg' },
  'farinha de trigo tipo 1':             { valor: 5.50, qty: 1000, unidade: 'kg' },
  'farinha de trigo com fermento':       { valor: 6.50, qty: 1000, unidade: 'kg' },
  'farinha de trigo integral':           { valor: 7.00, qty: 1000, unidade: 'kg' },
  'farinha de amendoas':                 { valor: 60.00, qty: 500, unidade: 'kg' },
  'amido de milho':                      { valor: 8.00, qty: 500, unidade: 'kg' },
  'amido de milho (maisena)':            { valor: 8.00, qty: 500, unidade: 'kg' },
  'maizena':                             { valor: 8.00, qty: 500, unidade: 'kg' },
  'farinha de rosca':                    { valor: 6.00, qty: 500, unidade: 'kg' },
  'farinha panko':                       { valor: 12.00, qty: 500, unidade: 'kg' },
  'polvilho doce':                       { valor: 9.00, qty: 1000, unidade: 'kg' },
  'polvilho azedo':                      { valor: 11.00, qty: 500, unidade: 'kg' },
  'farinha de coco':                     { valor: 22.00, qty: 500, unidade: 'kg' },
  'farinha de mandioca':                 { valor: 7.00, qty: 500, unidade: 'kg' },
  'farinha de milho':                    { valor: 5.00, qty: 500, unidade: 'kg' },
  'fuba':                                { valor: 5.00, qty: 500, unidade: 'kg' },
  'aveia em flocos':                     { valor: 9.00, qty: 500, unidade: 'kg' },
  // ── AÇÚCARES ─────────────────────────────────────────────────────────
  'acucar refinado':                     { valor: 4.50, qty: 1000, unidade: 'kg' },
  'acucar cristal':                      { valor: 4.00, qty: 1000, unidade: 'kg' },
  'acucar de confeiteiro':               { valor: 8.00, qty: 500, unidade: 'kg' },
  'acucar mascavo':                      { valor: 9.00, qty: 1000, unidade: 'kg' },
  'acucar demerara':                     { valor: 10.00, qty: 1000, unidade: 'kg' },
  'mel':                                 { valor: 30.00, qty: 500, unidade: 'kg' },
  'glucose de milho':                    { valor: 14.00, qty: 1000, unidade: 'kg' },
  'glicose de milho':                    { valor: 14.00, qty: 1000, unidade: 'kg' },
  // ── CHOCOLATES E CACAU ───────────────────────────────────────────────
  'chocolate meio amargo':               { valor: 55.00, qty: 1000, unidade: 'kg' },
  'chocolate ao leite':                  { valor: 50.00, qty: 1000, unidade: 'kg' },
  'chocolate branco':                    { valor: 50.00, qty: 1000, unidade: 'kg' },
  'chocolate em po 50%':                 { valor: 35.00, qty: 500, unidade: 'kg' },
  'cacau em po 100%':                    { valor: 50.00, qty: 500, unidade: 'kg' },
  'chocolate granulado':                 { valor: 18.00, qty: 500, unidade: 'kg' },
  'gotas de chocolate':                  { valor: 45.00, qty: 1000, unidade: 'kg' },
  // ── LATICÍNIOS ───────────────────────────────────────────────────────
  'leite integral':                      { valor: 5.00, qty: 1000, unidade: 'L' },
  'leite condensado':                    { valor: 7.50, qty: 395, unidade: 'kg' },
  'creme de leite':                      { valor: 5.00, qty: 200, unidade: 'L' },
  'creme de leite fresco':               { valor: 28.00, qty: 1000, unidade: 'L' },
  'leite em po':                         { valor: 32.00, qty: 800, unidade: 'kg' },
  'requeijao cremoso':                   { valor: 13.00, qty: 400, unidade: 'kg' },
  'cream cheese':                        { valor: 35.00, qty: 500, unidade: 'kg' },
  'iogurte natural':                     { valor: 9.00, qty: 1000, unidade: 'L' },
  'ricota':                              { valor: 22.00, qty: 500, unidade: 'kg' },
  'queijo mussarela':                    { valor: 27.00, qty: 500, unidade: 'kg' },
  'mussarela':                           { valor: 27.00, qty: 500, unidade: 'kg' },
  'queijo prato':                        { valor: 30.00, qty: 500, unidade: 'kg' },
  'queijo cheddar':                      { valor: 38.00, qty: 500, unidade: 'kg' },
  'cheddar fatiado':                     { valor: 38.00, qty: 500, unidade: 'kg' },
  'queijo parmesao':                     { valor: 50.00, qty: 500, unidade: 'kg' },
  'parmesao ralado':                     { valor: 28.00, qty: 250, unidade: 'kg' },
  // ── OVOS ──────────────────────────────────────────────────────────────
  'ovos':                                { valor: 22.00, qty: 30, unidade: 'un' },
  'ovos (bandeja 30un)':                 { valor: 22.00, qty: 30, unidade: 'un' },
  'ovos (duzia)':                        { valor: 12.00, qty: 12, unidade: 'un' },
  // ── GORDURAS ──────────────────────────────────────────────────────────
  'manteiga sem sal':                    { valor: 28.00, qty: 500, unidade: 'kg' },
  'manteiga com sal':                    { valor: 26.00, qty: 500, unidade: 'kg' },
  'margarina culinaria':                 { valor: 12.00, qty: 1000, unidade: 'kg' },
  'oleo de soja':                        { valor: 8.00, qty: 900, unidade: 'L' },
  'oleo de canola':                      { valor: 14.00, qty: 900, unidade: 'L' },
  'oleo de coco':                        { valor: 25.00, qty: 500, unidade: 'L' },
  'azeite de oliva':                     { valor: 35.00, qty: 500, unidade: 'L' },
  // ── FERMENTOS ─────────────────────────────────────────────────────────
  'fermento quimico':                    { valor: 9.00, qty: 250, unidade: 'kg' },
  'fermento biologico seco':             { valor: 14.00, qty: 125, unidade: 'kg' },
  'bicarbonato de sodio':                { valor: 6.00, qty: 200, unidade: 'kg' },
  // ── CARNES ────────────────────────────────────────────────────────────
  'carne moida':                         { valor: 32.00, qty: 1000, unidade: 'kg' },
  'carne bovina (paleta)':               { valor: 35.00, qty: 1000, unidade: 'kg' },
  'file mignon':                         { valor: 90.00, qty: 1000, unidade: 'kg' },
  'peito de frango':                     { valor: 18.00, qty: 1000, unidade: 'kg' },
  'frango desfiado':                     { valor: 22.00, qty: 1000, unidade: 'kg' },
  'bacon':                               { valor: 50.00, qty: 1000, unidade: 'kg' },
  'linguica':                            { valor: 25.00, qty: 1000, unidade: 'kg' },
  'linguica calabresa':                  { valor: 28.00, qty: 1000, unidade: 'kg' },
  'presunto':                            { valor: 32.00, qty: 1000, unidade: 'kg' },
  'peito de peru':                       { valor: 55.00, qty: 1000, unidade: 'kg' },
  'salame':                              { valor: 60.00, qty: 1000, unidade: 'kg' },
  // ── VEGETAIS E LEGUMES ────────────────────────────────────────────────
  'alface':                              { valor: 4.50, qty: 300, unidade: 'kg' },
  'tomate':                              { valor: 8.00, qty: 1000, unidade: 'kg' },
  'cebola':                              { valor: 5.00, qty: 1000, unidade: 'kg' },
  'batata':                              { valor: 5.00, qty: 1000, unidade: 'kg' },
  'batata inglesa':                      { valor: 5.00, qty: 1000, unidade: 'kg' },
  'alho':                                { valor: 28.00, qty: 1000, unidade: 'kg' },
  'cenoura':                             { valor: 5.00, qty: 1000, unidade: 'kg' },
  'pimentao':                            { valor: 10.00, qty: 1000, unidade: 'kg' },
  // ── FRUTAS ────────────────────────────────────────────────────────────
  'morango fresco':                      { valor: 18.00, qty: 500, unidade: 'kg' },
  'limao':                               { valor: 7.00, qty: 1000, unidade: 'kg' },
  'banana':                              { valor: 5.00, qty: 1000, unidade: 'kg' },
  'maracuja':                            { valor: 12.00, qty: 1000, unidade: 'kg' },
  'manga':                               { valor: 6.00, qty: 1000, unidade: 'kg' },
  'abacaxi':                             { valor: 5.00, qty: 1000, unidade: 'kg' },
  'coco ralado':                         { valor: 22.00, qty: 500, unidade: 'kg' },
  'uva passa':                           { valor: 30.00, qty: 500, unidade: 'kg' },
  'polpa de frutas':                     { valor: 18.00, qty: 1000, unidade: 'kg' },
  'polpa de acai':                       { valor: 25.00, qty: 1000, unidade: 'kg' },
  // ── TEMPEROS ──────────────────────────────────────────────────────────
  'sal':                                 { valor: 3.00, qty: 1000, unidade: 'kg' },
  'pimenta do reino':                    { valor: 30.00, qty: 100, unidade: 'kg' },
  'oregano':                             { valor: 12.00, qty: 100, unidade: 'kg' },
  'canela em po':                        { valor: 20.00, qty: 200, unidade: 'kg' },
  'noz moscada':                         { valor: 18.00, qty: 100, unidade: 'kg' },
  // ── PADARIA / PÃES PRONTOS ─────────────────────────────────────────────
  'pao de hamburguer':                   { valor: 1.50, qty: 1, unidade: 'un' },
  'pao brioche':                         { valor: 2.50, qty: 1, unidade: 'un' },
  'pao de hot dog':                      { valor: 1.20, qty: 1, unidade: 'un' },
  // ── MOLHOS / CONDIMENTOS ───────────────────────────────────────────────
  'ketchup':                             { valor: 12.00, qty: 1000, unidade: 'kg' },
  'mostarda':                            { valor: 14.00, qty: 1000, unidade: 'kg' },
  'maionese':                            { valor: 14.00, qty: 1000, unidade: 'kg' },
  'molho de tomate':                     { valor: 6.00, qty: 1000, unidade: 'kg' },
  // ── PIZZA / MASSAS ─────────────────────────────────────────────────────
  'azeitona preta':                      { valor: 35.00, qty: 1000, unidade: 'kg' },
  'azeitona verde':                      { valor: 32.00, qty: 1000, unidade: 'kg' },
  'atum em lata':                        { valor: 14.00, qty: 1000, unidade: 'kg' },
  // ── MARMITARIA / RESTAURANTE BÁSICO ───────────────────────────────────
  'arroz branco':                        { valor: 5.50, qty: 1000, unidade: 'kg' },
  'arroz':                               { valor: 5.50, qty: 1000, unidade: 'kg' },
  'feijao carioca':                      { valor: 9.00, qty: 1000, unidade: 'kg' },
  'feijao preto':                        { valor: 10.00, qty: 1000, unidade: 'kg' },
  'macarrao':                            { valor: 6.00, qty: 500, unidade: 'kg' },
  // ── BEBIDAS ────────────────────────────────────────────────────────────
  'cafe em po':                          { valor: 45.00, qty: 1000, unidade: 'kg' },
  'cafe em graos':                       { valor: 60.00, qty: 1000, unidade: 'kg' },
  'refrigerante 2l':                     { valor: 8.00, qty: 2000, unidade: 'L' },
  'suco em caixa 1l':                    { valor: 8.00, qty: 1000, unidade: 'L' },
};

/**
 * Retorna preço de mercado pra um insumo dado seu nome + qty/unidade do template.
 * Escalona proporcionalmente se a quantidade do template diferir do padrão da
 * base de dados.
 *
 * @returns {number|null} R$ ou null se não houver match
 */
export function getMarketPrice(nome, qtdBruta, unidade) {
  if (!nome) return null;
  const key = _norm(nome);
  let entry = PRICES[key];
  if (!entry) {
    // Tenta sem parênteses e sem texto extra: "Açúcar refinado (cristal)" → "acucar refinado"
    const stripped = key.replace(/\s*\([^)]*\)\s*/g, '').trim();
    if (stripped !== key) entry = PRICES[stripped];
  }
  if (!entry) return null;

  // Mesma unidade base? Escalona proporcional. Diferente unidade → conservador, retorna preço base.
  const qtBase = Number(entry.qty) || 0;
  const qtUser = Number(qtdBruta) || 0;
  if (qtBase <= 0 || qtUser <= 0) return entry.valor;

  // Se o template usa qty maior/menor pra mesma unidade, escala
  if (entry.unidade === unidade || (entry.unidade === 'kg' && unidade === 'kg') || (entry.unidade === 'L' && unidade === 'L') || (entry.unidade === 'un' && unidade === 'un')) {
    return Number(((entry.valor / qtBase) * qtUser).toFixed(2));
  }
  // Unidade diferente — retorna preço base mesmo (não tentamos converter kg↔L etc)
  return entry.valor;
}

/**
 * Aplica preços de mercado em uma lista de insumos do template.
 * Mutates não — retorna lista nova.
 */
export function aplicarPrecosMercado(insumos) {
  if (!Array.isArray(insumos)) return insumos;
  return insumos.map(i => {
    if (Number(i?.valor_pago) > 0) return i; // já tem preço, respeita
    const preco = getMarketPrice(i.nome, i.quantidade_bruta, i.unidade_medida);
    return preco != null ? { ...i, valor_pago: preco } : i;
  });
}

/**
 * Conta quantos insumos da lista têm match na base de preços (pra UI mostrar
 * "X de Y itens já vêm com preço médio de mercado").
 */
export function contarItensComPreco(insumos) {
  if (!Array.isArray(insumos)) return 0;
  return insumos.filter(i => getMarketPrice(i.nome, i.quantidade_bruta, i.unidade_medida) != null).length;
}
