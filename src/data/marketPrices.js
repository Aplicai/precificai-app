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
  'polvilho azedo':                      { valor: 8.50, qty: 500, unidade: 'kg' },
  'farinha de coco':                     { valor: 22.00, qty: 500, unidade: 'kg' },
  'farinha de mandioca':                 { valor: 7.00, qty: 500, unidade: 'kg' },
  'farinha de milho':                    { valor: 5.00, qty: 500, unidade: 'kg' },
  'fuba':                                { valor: 5.50, qty: 1000, unidade: 'kg' },
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
  'chocolate em po 50%':                 { valor: 10.00, qty: 200, unidade: 'kg' },
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
  'pimenta do reino':                    { valor: 12.00, qty: 100, unidade: 'kg' },
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
  // ── CONFEITARIA EXPANDIDO (28.35) ─────────────────────────────────────
  'chantilly':                           { valor: 22.00, qty: 1000, unidade: 'L' },
  'mascarpone':                          { valor: 80.00, qty: 500, unidade: 'kg' },
  'essencia de baunilha':                { valor: 8.00, qty: 100, unidade: 'L' },
  'extrato de baunilha':                 { valor: 25.00, qty: 100, unidade: 'L' },
  'essencia de amendoas':                { valor: 8.00, qty: 100, unidade: 'L' },
  'essencia de rum':                     { valor: 8.00, qty: 100, unidade: 'L' },
  'aroma de manteiga':                   { valor: 12.00, qty: 100, unidade: 'L' },
  'pasta de baunilha':                   { valor: 35.00, qty: 100, unidade: 'kg' },
  'corante gel (diversas cores)':        { valor: 5.00, qty: 1, unidade: 'un' },
  'confeitos coloridos':                 { valor: 22.00, qty: 500, unidade: 'kg' },
  'pasta americana':                     { valor: 28.00, qty: 800, unidade: 'kg' },
  'fondant':                             { valor: 32.00, qty: 1000, unidade: 'kg' },
  'glitter comestivel':                  { valor: 8.00, qty: 1, unidade: 'un' },
  'po de ouro comestivel':               { valor: 25.00, qty: 1, unidade: 'un' },
  'spray de brilho comestivel':          { valor: 18.00, qty: 1, unidade: 'un' },
  // Coberturas e recheios
  'geleia de morango':                   { valor: 12.00, qty: 500, unidade: 'kg' },
  'geleia de damasco':                   { valor: 18.00, qty: 500, unidade: 'kg' },
  'geleia de pimenta':                   { valor: 14.00, qty: 300, unidade: 'kg' },
  'doce de leite':                       { valor: 12.00, qty: 400, unidade: 'kg' },
  'goiabada':                            { valor: 15.00, qty: 1000, unidade: 'kg' },
  'leite ninho em po':                   { valor: 50.00, qty: 800, unidade: 'kg' },
  'leite ninho':                         { valor: 50.00, qty: 800, unidade: 'kg' },
  'nutella':                             { valor: 35.00, qty: 350, unidade: 'kg' },
  'creme de avela':                      { valor: 28.00, qty: 350, unidade: 'kg' },
  'frutas cristalizadas':                { valor: 28.00, qty: 500, unidade: 'kg' },
  // Nozes e sementes
  'castanha de caju':                    { valor: 70.00, qty: 500, unidade: 'kg' },
  'nozes':                               { valor: 80.00, qty: 500, unidade: 'kg' },
  'amendoim torrado':                    { valor: 18.00, qty: 1000, unidade: 'kg' },
  'amendoas':                            { valor: 90.00, qty: 500, unidade: 'kg' },
  'pistache':                            { valor: 150.00, qty: 500, unidade: 'kg' },
  'avela':                               { valor: 130.00, qty: 500, unidade: 'kg' },
  // Especiarias
  'cravo da india':                      { valor: 15.00, qty: 100, unidade: 'kg' },
  'gengibre em po':                      { valor: 18.00, qty: 100, unidade: 'kg' },
  'erva doce':                           { valor: 15.00, qty: 100, unidade: 'kg' },
  // Fermentação
  'gelatina em po sem sabor':            { valor: 4.50, qty: 24, unidade: 'kg' },
  'gelatina em folha':                   { valor: 18.00, qty: 20, unidade: 'un' },
  'agar agar':                           { valor: 80.00, qty: 200, unidade: 'kg' },
  // ── HAMBURGUERIA / LANCHONETE ──────────────────────────────────────────
  'queijo gorgonzola':                   { valor: 20.00, qty: 200, unidade: 'kg' },
  'gorgonzola':                          { valor: 20.00, qty: 200, unidade: 'kg' },
  'queijo brie':                         { valor: 100.00, qty: 250, unidade: 'kg' },
  'brie':                                { valor: 100.00, qty: 250, unidade: 'kg' },
  'queijo provolone':                    { valor: 45.00, qty: 500, unidade: 'kg' },
  'queijo de bufala':                    { valor: 80.00, qty: 250, unidade: 'kg' },
  'mussarela de bufala':                 { valor: 75.00, qty: 250, unidade: 'kg' },
  'cheddar em barra':                    { valor: 38.00, qty: 1000, unidade: 'kg' },
  'cheddar cremoso':                     { valor: 32.00, qty: 1500, unidade: 'kg' },
  'salsicha':                            { valor: 18.00, qty: 1000, unidade: 'kg' },
  'hamburguer artesanal (180g)':         { valor: 4.50, qty: 1, unidade: 'un' },
  'hamburguer congelado (90g)':          { valor: 1.50, qty: 1, unidade: 'un' },
  // Vegetais extras
  'rucula':                              { valor: 5.00, qty: 200, unidade: 'kg' },
  'agriao':                              { valor: 4.00, qty: 200, unidade: 'kg' },
  'pepino':                              { valor: 5.00, qty: 1000, unidade: 'kg' },
  'cebola roxa':                         { valor: 7.00, qty: 1000, unidade: 'kg' },
  'tomate cereja':                       { valor: 18.00, qty: 500, unidade: 'kg' },
  'cogumelos paris':                     { valor: 35.00, qty: 200, unidade: 'kg' },
  'champignon em conserva':              { valor: 12.00, qty: 200, unidade: 'kg' },
  'milho em conserva':                   { valor: 6.00, qty: 200, unidade: 'kg' },
  'ervilha em conserva':                 { valor: 6.00, qty: 200, unidade: 'kg' },
  // ── PIZZARIA ──────────────────────────────────────────────────────────
  'massa de pizza pre pronta':           { valor: 6.00, qty: 1, unidade: 'un' },
  'fermento biologico fresco':           { valor: 8.00, qty: 500, unidade: 'kg' },
  'palmito em conserva':                 { valor: 18.00, qty: 300, unidade: 'kg' },
  'rodelas de cebola':                   { valor: 5.00, qty: 1000, unidade: 'kg' },
  // ── AÇAITERIA / SORVETERIA ─────────────────────────────────────────────
  'granola':                             { valor: 28.00, qty: 1000, unidade: 'kg' },
  'paçoca':                              { valor: 22.00, qty: 1000, unidade: 'kg' },
  'pacoca':                              { valor: 22.00, qty: 1000, unidade: 'kg' },
  'farinha lactea':                      { valor: 18.00, qty: 400, unidade: 'kg' },
  'tapioca em flocos':                   { valor: 8.00, qty: 500, unidade: 'kg' },
  'leite condensado fit':                { valor: 12.00, qty: 395, unidade: 'kg' },
  'sorvete cremoso':                     { valor: 30.00, qty: 1000, unidade: 'L' },
  'casquinha de sorvete':                { valor: 0.30, qty: 1, unidade: 'un' },
  'cone de wafer':                       { valor: 0.50, qty: 1, unidade: 'un' },
  // ── PEIXES E FRUTOS DO MAR (japonesa/restaurante) ──────────────────────
  'salmao fresco':                       { valor: 90.00, qty: 1000, unidade: 'kg' },
  'atum fresco':                         { valor: 80.00, qty: 1000, unidade: 'kg' },
  'tilapia':                             { valor: 35.00, qty: 1000, unidade: 'kg' },
  'camarao limpo':                       { valor: 80.00, qty: 1000, unidade: 'kg' },
  'arroz japones':                       { valor: 12.00, qty: 1000, unidade: 'kg' },
  'alga nori':                           { valor: 15.00, qty: 50, unidade: 'kg' },
  'shoyu':                               { valor: 12.00, qty: 500, unidade: 'L' },
  'molho de shoyu':                      { valor: 12.00, qty: 500, unidade: 'L' },
  'gergelim':                            { valor: 28.00, qty: 250, unidade: 'kg' },
  'wasabi em pasta':                     { valor: 18.00, qty: 200, unidade: 'kg' },
  'gengibre em conserva':                { valor: 14.00, qty: 200, unidade: 'kg' },

  // ── MONTAR A RECEITA (21/10/2026): itens comuns em receitas sugeridas
  // pela biblioteca e pela IA que ficavam sem preço. Varejo médio. ──────
  'carne seca':                          { valor: 55.00, qty: 1000, unidade: 'kg' },
  'charque':                             { valor: 45.00, qty: 1000, unidade: 'kg' },
  'mandioca':                            { valor: 7.00, qty: 1000, unidade: 'kg' },
  'aipim':                               { valor: 7.00, qty: 1000, unidade: 'kg' },
  'macaxeira':                           { valor: 7.00, qty: 1000, unidade: 'kg' },
  'requeijao':                           { valor: 13.00, qty: 400, unidade: 'kg' },
  'mussarela ralada':                    { valor: 30.00, qty: 500, unidade: 'kg' },
  'queijo mussarela ralado':             { valor: 30.00, qty: 500, unidade: 'kg' },
  'alcatra':                             { valor: 48.00, qty: 1000, unidade: 'kg' },
  'coxao mole':                          { valor: 45.00, qty: 1000, unidade: 'kg' },
  'paio':                                { valor: 40.00, qty: 1000, unidade: 'kg' },
  'costelinha suina defumada':           { valor: 38.00, qty: 1000, unidade: 'kg' },
  'batata-doce':                         { valor: 6.00, qty: 1000, unidade: 'kg' },
  'batata doce':                         { valor: 6.00, qty: 1000, unidade: 'kg' },
  'abobrinha':                           { valor: 6.00, qty: 1000, unidade: 'kg' },
  'brocolis':                            { valor: 14.00, qty: 1000, unidade: 'kg' },
  'couve':                               { valor: 15.00, qty: 1000, unidade: 'kg' },
  'laranja':                             { valor: 5.00, qty: 1000, unidade: 'kg' },
  'grao-de-bico':                        { valor: 14.00, qty: 1000, unidade: 'kg' },
  'grao de bico':                        { valor: 14.00, qty: 1000, unidade: 'kg' },
  'leite de coco':                       { valor: 5.00, qty: 200, unidade: 'L' },
  'batata palha':                        { valor: 8.00, qty: 120, unidade: 'kg' },
  'biscoito maisena':                    { valor: 5.00, qty: 200, unidade: 'kg' },
  'pao de forma':                        { valor: 9.00, qty: 500, unidade: 'kg' },
  'massa para lasanha':                  { valor: 8.00, qty: 500, unidade: 'kg' },
  'cheiro-verde':                        { valor: 3.00, qty: 100, unidade: 'kg' },
  'cheiro verde':                        { valor: 3.00, qty: 100, unidade: 'kg' },
  'salsinha':                            { valor: 3.00, qty: 100, unidade: 'kg' },
  'coentro':                             { valor: 3.00, qty: 100, unidade: 'kg' },
  'cebolinha':                           { valor: 3.00, qty: 100, unidade: 'kg' },
  'frango':                              { valor: 13.00, qty: 1000, unidade: 'kg' },
  'frango inteiro':                      { valor: 13.00, qty: 1000, unidade: 'kg' },
  'coxa e sobrecoxa':                    { valor: 14.00, qty: 1000, unidade: 'kg' },
  'contrafile':                          { valor: 55.00, qty: 1000, unidade: 'kg' },
  'acem':                                { valor: 35.00, qty: 1000, unidade: 'kg' },
  'acem bovino':                         { valor: 35.00, qty: 1000, unidade: 'kg' },
  'patinho':                             { valor: 45.00, qty: 1000, unidade: 'kg' },
  'costela bovina':                      { valor: 32.00, qty: 1000, unidade: 'kg' },
  'peixe':                               { valor: 35.00, qty: 1000, unidade: 'kg' },
  'peixe em posta':                      { valor: 35.00, qty: 1000, unidade: 'kg' },
  'camarao':                             { valor: 70.00, qty: 1000, unidade: 'kg' },
  'pimentao verde':                      { valor: 9.00, qty: 1000, unidade: 'kg' },
  'pimentao vermelho':                   { valor: 15.00, qty: 1000, unidade: 'kg' },
  'pimentao amarelo':                    { valor: 15.00, qty: 1000, unidade: 'kg' },
  'couve-flor':                          { valor: 12.00, qty: 1000, unidade: 'kg' },
  'acelga':                              { valor: 8.00, qty: 1000, unidade: 'kg' },
  'feijao verde':                        { valor: 15.00, qty: 1000, unidade: 'kg' },
  'queijo coalho':                       { valor: 50.00, qty: 1000, unidade: 'kg' },
  'manteiga de garrafa':                 { valor: 30.00, qty: 500, unidade: 'L' },
  'azeite de dende':                     { valor: 10.00, qty: 200, unidade: 'L' },
  'molho shoyu':                         { valor: 6.00, qty: 150, unidade: 'L' },
  'oleo de gergelim':                    { valor: 15.00, qty: 100, unidade: 'L' },
  'macarrao para yakisoba':              { valor: 8.00, qty: 500, unidade: 'kg' },
  'colorau':                             { valor: 3.00, qty: 100, unidade: 'kg' },
  'caldo de galinha':                    { valor: 3.50, qty: 57, unidade: 'kg' },
  'caldo de carne':                      { valor: 3.50, qty: 57, unidade: 'kg' },
  'caldo de legumes':                    { valor: 3.50, qty: 57, unidade: 'kg' },
  'palmito':                             { valor: 20.00, qty: 300, unidade: 'kg' },
  'liga neutra':                         { valor: 12.00, qty: 100, unidade: 'kg' },
  'extrato de tomate':                   { valor: 3.00, qty: 140, unidade: 'kg' },
  'vinagre':                             { valor: 4.00, qty: 750, unidade: 'L' },
  'goma de tapioca':                     { valor: 8.00, qty: 500, unidade: 'kg' },
  'cafe soluvel':                        { valor: 15.00, qty: 100, unidade: 'kg' },
  'chocolate fracionado':                { valor: 45.00, qty: 1000, unidade: 'kg' },
  'uva':                                 { valor: 14.00, qty: 1000, unidade: 'kg' },
  'uva italia':                          { valor: 14.00, qty: 1000, unidade: 'kg' },
  'cachaca':                             { valor: 20.00, qty: 1000, unidade: 'L' },
  'file de peixe':                       { valor: 40.00, qty: 1000, unidade: 'kg' },
  'polpa de maracuja':                   { valor: 15.00, qty: 1000, unidade: 'kg' },
  // Rodada de 500 testes (22/10/2026).
  'ameixa seca':                         { valor: 12.00, qty: 200, unidade: 'kg' },
  'maca':                                { valor: 10.00, qty: 1000, unidade: 'kg' },
  'gelatina de morango':                 { valor: 2.50, qty: 25, unidade: 'kg' },
  'biscoito calipso':                    { valor: 7.00, qty: 130, unidade: 'kg' },
  'corante gel vermelho':                { valor: 7.00, qty: 25, unidade: 'kg' },
  'forminha para cupcake':               { valor: 8.00, qty: 100, unidade: 'un' },
  'farinha de arroz':                    { valor: 12.00, qty: 1000, unidade: 'kg' },
  'farinha de aveia':                    { valor: 9.00, qty: 450, unidade: 'kg' },
  'oleo de girassol':                    { valor: 13.00, qty: 900, unidade: 'L' },
  'vinagre de maca':                     { valor: 7.00, qty: 750, unidade: 'L' },
  'biscoito recheado':                   { valor: 4.50, qty: 130, unidade: 'kg' },
  'pasta de pistache':                   { valor: 70.00, qty: 200, unidade: 'kg' },
  'essencia de panetone':                { valor: 8.00, qty: 100, unidade: 'L' },
  'milho para canjica':                  { valor: 6.00, qty: 500, unidade: 'kg' },
  'canela em pau':                       { valor: 6.00, qty: 30, unidade: 'kg' },
  'framboesa':                           { valor: 25.00, qty: 300, unidade: 'kg' },
  'amora':                               { valor: 25.00, qty: 300, unidade: 'kg' },
  'trigo para kibe':                     { valor: 6.50, qty: 500, unidade: 'kg' },
  'hortela':                             { valor: 3.50, qty: 100, unidade: 'kg' },
  'pao frances':                         { valor: 0.90, qty: 1, unidade: 'un' },
  'feijao fradinho':                     { valor: 8.00, qty: 500, unidade: 'kg' },
  'camarao seco':                        { valor: 25.00, qty: 200, unidade: 'kg' },
  'bacalhau':                            { valor: 70.00, qty: 1000, unidade: 'kg' },
  'queijo minas padrao':                 { valor: 45.00, qty: 1000, unidade: 'kg' },
  'queijo meia cura':                    { valor: 55.00, qty: 1000, unidade: 'kg' },
  'lombo suino':                         { valor: 30.00, qty: 1000, unidade: 'kg' },
  'alho poro':                           { valor: 6.00, qty: 1, unidade: 'un' },
  'margarina para folhar':               { valor: 22.00, qty: 1000, unidade: 'kg' },
  'farinha de milho flocada':            { valor: 4.50, qty: 500, unidade: 'kg' },
  'pao de forma integral':               { valor: 10.00, qty: 500, unidade: 'kg' },
  'tortilha':                            { valor: 12.00, qty: 10, unidade: 'un' },
  'sardinha em lata':                    { valor: 7.00, qty: 125, unidade: 'kg' },
  'folha de bananeira':                  { valor: 0.50, qty: 1, unidade: 'un' },
  'espinafre':                           { valor: 5.00, qty: 300, unidade: 'kg' },
  'alface americana':                    { valor: 5.00, qty: 300, unidade: 'kg' },
  'massa de pastel':                     { valor: 10.00, qty: 500, unidade: 'kg' },
  'gengibre':                            { valor: 20.00, qty: 1000, unidade: 'kg' },
  'amendoim':                            { valor: 16.00, qty: 1000, unidade: 'kg' },
  'espiga de milho verde':               { valor: 1.50, qty: 1, unidade: 'un' },
  'suco de limao':                       { valor: 20.00, qty: 1000, unidade: 'L' },
};

/**
 * Converte qty + unidade pra unidade BASE (g, mL, un).
 * - kg → g (×1000)
 * - L  → mL (×1000)
 * - g, mL, un → mantém
 * Se unidade desconhecida, retorna qty original (best-effort).
 */
function _toBase(qty, unidade) {
  const n = Number(qty) || 0;
  const u = String(unidade || '').toLowerCase();
  if (u === 'kg') return { qty: n * 1000, unit: 'g' };
  if (u === 'l') return { qty: n * 1000, unit: 'mL' };
  if (u === 'g' || u === 'ml' || u === 'un') return { qty: n, unit: u === 'ml' ? 'mL' : u };
  return { qty: n, unit: u };
}

/**
 * Retorna preço de mercado pra um insumo dado seu nome + qty/unidade do template.
 * Sessão 28.35: agora converte kg↔g e L↔mL automaticamente — antes retornava
 * preço base "errado" quando entry estava em 'kg' mas request vinha em 'g'.
 *
 * @returns {number|null} R$ ou null se não houver match
 */
export function getMarketPrice(nome, qtdBruta, unidade) {
  if (!nome) return null;
  const key = _norm(nome);
  let entry = PRICES[key];
  if (!entry) {
    // Tenta sem parênteses: "Açúcar refinado (cristal)" → "acucar refinado"
    const stripped = key.replace(/\s*\([^)]*\)\s*/g, '').trim();
    if (stripped !== key) entry = PRICES[stripped];
  }
  if (!entry) return null;

  // `entry.qty` já está na unidade-base (g/mL/un) — 'kg'/'L' na entrada só diz
  // o TIPO. Passar por _toBase multiplicava por 1000 (395 g → 395 kg) e o preço
  // saía 1000× menor (leite condensado R$ 0,01).
  const base = { qty: Number(entry.qty) || 0, unit: _toBase(1, entry.unidade).unit };
  const req = _toBase(qtdBruta, unidade);
  if (base.qty <= 0 || req.qty <= 0) return entry.valor;

  // Mesma unidade base (depois de converter kg→g e L→mL)? Escalona proporcional.
  if (base.unit === req.unit) {
    return Number(((entry.valor / base.qty) * req.qty).toFixed(2));
  }
  // Unidades incompatíveis (g vs mL vs un) → retorna preço base.
  return entry.valor;
}

/**
 * Entrada da base com a unidade-base (g, mL ou un), para quem precisa saber
 * se a unidade bate antes de usar o preço (getMarketPrice devolve o preço do
 * pacote quando não bate). null = a base não conhece.
 */
export function getMarketPriceInfo(nome) {
  if (!nome) return null;
  const key = _norm(nome);
  const entry = PRICES[key] || PRICES[key.replace(/\s*\([^)]*\)\s*/g, '').trim()];
  if (!entry) return null;
  return { valor: Number(entry.valor) || 0, qty: Number(entry.qty) || 0, unit: _toBase(1, entry.unidade).unit };
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
