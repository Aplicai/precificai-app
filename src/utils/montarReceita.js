/**
 * Montar a receita tocando (primeiro preço, 21/10/2026).
 * Desenho: .specs/plans/ia-monta-receita.design.md
 *
 * A pessoa diz o produto; o app sugere os ingredientes da receita inteira e
 * ela toca nos que usa. O custo aparece a cada toque. De onde vêm as
 * sugestões, nesta ordem:
 *   1. biblioteca própria (src/data/receitasSugeridas.js), pelo nome;
 *   2. IA (edge function `montar-receita`), validada por `validarRespostaIA`;
 *   3. ingredientes comuns do nicho, quando nada acima responde.
 *
 * Preço de cada ingrediente: o da conta da pessoa > preço médio da base
 * (src/data/marketPrices.js) > sem preço (a pessoa põe). A IA nunca dá preço.
 *
 * Quantidades da receita inteira em g, ml ou un; a embalagem vai 1 por porção.
 * Puro, sem React/RN (testado em __tests__/montarReceita.test.mjs).
 */
import { getMarketPriceInfo } from '../data/marketPrices';

export const UNIDADES = ['g', 'ml', 'un'];
export const MAX_QTD = { g: 20000, ml: 20000, un: 200 };
export const MAX_ITENS = 25;
export const MAX_RENDE = 1000;

/** minúscula, sem acento, espaços simples */
export function normTexto(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "frango grelhado" → "Frango grelhado" */
export function capitalizar(s) {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/**
 * Receita da biblioteca cujo termo aparece no nome digitado. Vários termos
 * batendo: ganha o mais longo ("ninho com nutella" vence "ninho").
 * @returns {object|null}
 */
/** Abreviações de cardápio: "coxinha d frango", "pastel q queijo", "x c bacon". */
function expandir(t) {
  return ` ${t} `.replace(/ (d|q) /g, ' de ').replace(/ c /g, ' com ').trim();
}

export function acharReceita(nomeProduto, biblioteca, ramo) {
  // Com o ramo do produto, prefere receita do mesmo ramo ("Pizza de chocolate
  // com morango" é pizza, não o bolo de pote "chocolate com morango").
  if (ramo && Array.isArray(biblioteca)) {
    const doRamo = acharReceita(nomeProduto, biblioteca.filter((r) => r?.nicho === ramo));
    if (doRamo) return doRamo;
  }
  const t = expandir(normTexto(nomeProduto));
  if (!t || !Array.isArray(biblioteca)) return null;
  let melhor = null;
  let tam = 0;
  for (const r of biblioteca) {
    for (const termo of r?.termos || []) {
      const n = normTexto(termo);
      if (n && n.length > tam && (` ${t} `).includes(` ${n} `)) { melhor = r; tam = n.length; }
    }
  }
  if (melhor) return melhor;
  // Sem palavra inteira: aceita o plural ("brigadeiros", "pastéis" não; só
  // s/es), nunca pedaço de outra palavra ("bolonhesa" não é "bolo").
  for (const r of biblioteca) {
    for (const termo of r?.termos || []) {
      const n = normTexto(termo);
      if (n && n.length > tam && new RegExp(`(^| )${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(s|es)?( |$)`).test(t)) { melhor = r; tam = n.length; }
    }
  }
  return melhor;
}

/** Palavras do nome que não mudam a receita (ligação, tamanho, enfeite). */
const PALAVRAS_NEUTRAS = new Set(('de da do das dos com e no na em para p sabor recheio recheado recheada cobertura massa ' +
  'caseiro caseira tradicional gourmet especial simples fofinho fofinha molhadinho molhadinha artesanal fit delicioso deliciosa ' +
  'kg g gr grama gramas ml l litro litros un unidade unidades fatia fatias pedaco pedacos pote potes cento pequeno pequena ' +
  'medio media grande familia individual porcao porcoes marmita marmitas inteiro inteira d q c ' +
  'casa completo completa aberta aberto forno lenha prensado congelado congelada congelados gelado gelada tigela copo n no kit kits tamanho').split(' '));
/** Formas de uma palavra sem o plural: "doces" → doce/doc, "pastéis" → pastel, "bombons" → bombom. */
function semPlural(w) {
  const v = [w];
  if (w.length > 3) {
    if (w.endsWith('s')) v.push(w.slice(0, -1));
    if (w.endsWith('es')) v.push(w.slice(0, -2));
    if (/eis$/.test(w)) v.push(w.replace(/eis$/, 'el'));
    if (/ns$/.test(w)) v.push(w.replace(/ns$/, 'm'));
    if (/(oes|aes)$/.test(w)) v.push(w.replace(/(oes|aes)$/, 'ao'));
  }
  return v;
}
const raiz = (w) => semPlural(w);

/**
 * A receita da biblioteca cobre o nome digitado? Falso quando o nome traz
 * palavra que a receita não tem no nome, nos termos nem nos ingredientes
 * ("Escondidinho de carne seca" x receita de carne moída: "seca" sobra).
 * Aí vale perguntar à IA; se ela falhar, a receita da biblioteca serve.
 */
export function receitaCobreNome(nomeProduto, receita) {
  if (!receita) return false;
  const vocab = new Set();
  const juntar = (t) => normTexto(t).split(' ').forEach((w) => { if (w) raiz(w).forEach((x) => vocab.add(x)); });
  juntar(receita.nome);
  (receita.termos || []).forEach(juntar);
  // Do ingrediente vale só a 1ª palavra ("Essência de baunilha" não cobre
  // "baunilha"; "Leite integral" não cobre "integral").
  (receita.ingredientes || []).forEach((i) => juntar(normTexto(i?.[0]).split(' ')[0]));
  return expandir(normTexto(nomeProduto)).split(' ').every((w) => !w || /^\d/.test(w) || PALAVRAS_NEUTRAS.has(w) || raiz(w).some((x) => vocab.has(x)));
}

/** Segmento livre do perfil → nicho da biblioteca. null = não dá para dizer. */
const NICHO_POR_PALAVRA = [
  ['cafe da manha', 'padaria'], ['coffee', 'padaria'], ['tapioc', 'salgados'], ['cuscuz', 'salgados'],
  ['espet', 'petiscos'], ['churras', 'petiscos'], ['boteco', 'petiscos'], ['petisc', 'petiscos'], [' bar ', 'petiscos'], ['porcoes', 'petiscos'],
  ['drink', 'bebidas'], ['cafeter', 'bebidas'], ['food truck', 'hamburgueria'],
  ['acai', 'acai_sorvete'], ['sorvet', 'acai_sorvete'], ['geladinho', 'acai_sorvete'], ['sacole', 'acai_sorvete'], ['picol', 'acai_sorvete'],
  ['pizz', 'pizzaria'],
  ['hamburg', 'hamburgueria'], ['burger', 'hamburgueria'], ['lanch', 'hamburgueria'], ['hot dog', 'hamburgueria'], ['cachorro quente', 'hamburgueria'],
  ['marmit', 'marmitas'], ['quentinha', 'marmitas'], ['restaur', 'marmitas'], ['comida', 'marmitas'], ['refei', 'marmitas'],
  ['buffet', 'marmitas'], ['sopa', 'marmitas'], ['caldo', 'marmitas'], ['massas', 'marmitas'], ['vegan', 'marmitas'], ['vegetarian', 'marmitas'],
  ['japones', 'marmitas'], ['sushi', 'marmitas'], ['frutos do mar', 'marmitas'],
  ['salgad', 'salgados'], ['coxinha', 'salgados'], ['pastel', 'salgados'], ['empad', 'salgados'],
  ['padar', 'padaria'], ['panifica', 'padaria'], ['pao', 'padaria'],
  ['confeit', 'confeitaria'], ['bolo', 'confeitaria'], ['doce', 'confeitaria'], ['brigadeir', 'confeitaria'], ['trufa', 'confeitaria'], ['encomenda', 'confeitaria'], ['chocolat', 'confeitaria'],
  ['suco', 'bebidas'], ['cafe', 'bebidas'], ['bebida', 'bebidas'],
];
export function nichoDoSegmento(segmento) {
  const t = ` ${normTexto(segmento)} `;
  if (!t.trim()) return null;
  // Vale a palavra que aparece primeiro ("Confeitaria e salgados" = confeitaria).
  let melhor = null;
  let pos = Infinity;
  for (const [p, nicho] of NICHO_POR_PALAVRA) {
    const i = t.indexOf(p);
    if (i >= 0 && (i < pos || (i === pos && p.length > melhor.p.length))) { pos = i; melhor = { p, nicho }; }
  }
  return melhor ? melhor.nicho : null;
}

/** Palavra do produto → ramo. Vale a 1ª palavra conhecida do nome ("Bolo de
 * coco gelado" é bolo; "Lasanha à bolonhesa" é marmita). Palavra inteira. */
const RAMO_DA_PALAVRA = {};
for (const [ramo, palavras] of Object.entries({
  confeitaria: 'bolo brigadeiro trufa doce pudim brownie cupcake cookie bombom mousse pave cheesecake beijinho alfajor palha docinho',
  salgados: 'coxinha pastel empada empadinha empadao esfiha esfirra kibe quibe risole salgado enroladinho croquete joelho bolinha acaraje abara tapioca cuscuz beiju quiche croissant folhado fogazza',
  marmitas: 'marmita marmitex quentinha escondidinho feijoada lasanha strogonoff strogonof estrogonofe parmegiana galinhada moqueca yakisoba yakissoba picadinho baiao ' +
    'sopa caldo canja nhoque rondelli canelone espaguete macarronada fricasse salpicao risoto panqueca omelete tutu tropeiro carreteiro sarapatel buchada vatapa bobo ' +
    'tacaca manicoba temaki sushi sashimi poke prato pf almoco jantar refeicao comida feijao arroz bife peixe galinha rabada dobradinha',
  hamburgueria: 'hamburguer burger x lanche sanduiche hotdog wrap misto choripan burrito taco beirute bauru prensado smash',
  pizzaria: 'pizza calzone broto brotinho',
  padaria: 'pao rosca sonho broa',
  acai_sorvete: 'acai sorvete picole geladinho sacole chup',
  bebidas: 'suco cafe limonada vitamina milkshake refrigerante cha caipirinha caipiroska drink gin mojito soda smoothie batida quentao kombucha cappuccino latte frappuccino espresso expresso refri agua',
  petiscos: 'espetinho espeto kafta porcao petisco torresmo isca passarinho acebolada polenta frita fritas churrasco',
})) for (const w of palavras.split(' ')) RAMO_DA_PALAVRA[w] = ramo;

const RAMO_DA_EXPRESSAO = [['pao de mel', 'confeitaria'], ['bolo de pote', 'confeitaria'], ['cafe da manha', 'padaria'], ['cachorro quente', 'hamburgueria'], ['hot dog', 'hamburgueria'], ['frango a passarinho', 'petiscos'], ['batata frita', 'petiscos'], ['mandioca frita', 'petiscos']];
export function nichoDoProduto(nomeProduto) {
  const t = normTexto(nomeProduto);
  for (const [e, r] of RAMO_DA_EXPRESSAO) if ((` ${t} `).includes(` ${e} `)) return r;
  for (const w of t.split(' ')) {
    for (const x of semPlural(w)) if (RAMO_DA_PALAVRA[x]) return RAMO_DA_PALAVRA[x];
  }
  return null;
}

/**
 * Preço médio da base por kg (g), por litro (ml) ou por unidade (un).
 * g e ml valem igual (densidade 1, boa o bastante para comida). Pedido em
 * unidade que a base não vende assim (farinha "por unidade") = null: nunca
 * o preço do pacote inteiro como se fosse por kg.
 * null = a base não conhece.
 */
export function precoMedio(nome, un) {
  try {
    const b = getMarketPriceInfo(nome);
    if (!b || !(b.valor > 0) || !(b.qty > 0)) return null;
    const porUn = un === 'un';
    if (porUn !== (b.unit === 'un')) return null;
    const v = porUn ? b.valor / b.qty : (b.valor / b.qty) * 1000;
    return Math.round(v * 100) / 100;
  } catch (_) {
    return null;
  }
}

const pesoUn = (n) => { for (const w of [n, ...semPlural(n).slice(1)]) if (PESO_UN[w]) return PESO_UN[w]; return 0; };

/** Peso médio (g) de 1 unidade do que a base vende por kg ("2 cebolas"). */
const PESO_UN = {
  cebola: 150, 'cebola roxa': 150, tomate: 120, alho: 5, limao: 100, banana: 120, laranja: 200,
  cenoura: 150, batata: 200, 'batata-doce': 250, 'batata doce': 250, maca: 150, maracuja: 150,
  'cravo da india': 0.1, 'canela em pau': 3, abobrinha: 250, pimentao: 150, salsicha: 50, bacon: 15, 'cheddar fatiado': 20,
  mussarela: 20, presunto: 15, berinjela: 300, louro: 0.3, 'pimenta dedo de moca': 10, 'pimenta de cheiro': 5, 'pao de forma': 25, abacaxi: 1500, couve: 200, pacoca: 20, 'limao siciliano': 150, 'alga nori': 2.5, 'folha de alga nori': 2.5, 'pimentao verde': 150, 'pimentao vermelho': 150, 'pimentao amarelo': 150, morango: 15, 'morango fresco': 15, 'cheiro-verde': 100, 'cheiro verde': 100, salsinha: 100, coentro: 100, cebolinha: 100,
};

/** Custo da linha: preço por kg/L/un × quantidade (g/ml/un). Sem preço = 0. */
export function custoLinha(preco, q, un) {
  const p = Number(preco);
  const n = Number(q);
  if (!(p > 0) || !(n > 0)) return 0;
  return un === 'un' ? p * n : (p * n) / 1000;
}

/**
 * Custo da receita e da porção.
 * itens: [{ nome, q, un, preco (por kg/L/un, null = sem preço), emb (1 por porção) }]
 * @returns {{ custoReceita, custoPorcao, semPreco, itens }}
 *   custoReceita inclui a embalagem de todas as porções (emb × rende).
 */
export function custoReceita(itens, rende) {
  const r = Math.max(1, Math.round(Number(rende) || 1));
  let total = 0;
  let semPreco = 0;
  for (const it of Array.isArray(itens) ? itens : []) {
    if (!(Number(it?.preco) > 0)) { semPreco += 1; continue; }
    total += it.emb ? custoLinha(it.preco, it.q, it.un) * r : custoLinha(it.preco, it.q, it.un);
  }
  return { custoReceita: total, custoPorcao: total / r, semPreco };
}

function unidadeValida(u) {
  const t = normTexto(u);
  if (t === 'g' || t === 'gr' || t === 'gramas' || t === 'grama') return 'g';
  if (t === 'ml' || t === 'mililitros' || t === 'mililitro') return 'ml';
  if (t === 'un' || t === 'unid' || t === 'unidade' || t === 'unidades') return 'un';
  if (/^(kg|kilos?|quilos?)$/.test(t)) return 'kg';
  if (t === 'l' || t === 'litro' || t === 'litros') return 'l';
  return null;
}

/** Linha [nome, q, un] limpa ou null. kg/l viram g/ml. */
export function limparLinha(nome, q, u) {
  const n = capitalizar(String(nome ?? '').replace(/\s*\([^)]*\)\s*/g, ' '));
  let qtd = Number(q);
  let un = unidadeValida(u);
  if (!n || n.length > 60 || !Number.isFinite(qtd) || !un) return null;
  if (un === 'kg') { qtd *= 1000; un = 'g'; }
  if (un === 'l') { qtd *= 1000; un = 'ml'; }
  if (!(qtd > 0) || qtd > MAX_QTD[un]) return null;
  return [n, Math.round(qtd * 100) / 100, un];
}

/**
 * Resposta da IA (JSON do schema da edge function) → sugestão no formato da
 * biblioteca, ou null quando não serve. Linhas ruins são descartadas; nomes
 * repetidos ficam uma vez. Precisa de ao menos 2 ingredientes válidos.
 */
export function validarRespostaIA(json, nomeProduto) {
  if (!json || typeof json !== 'object') return null;
  const ingredientes = [];
  for (const i of Array.isArray(json.ingredientes) ? json.ingredientes : []) {
    const l = limparLinha(i?.nome, i?.quantidade, i?.unidade);
    if (!l) continue;
    const k = normTexto(l[0]);
    const igual = ingredientes.find((x) => normTexto(x[0]) === k);
    // Mesmo ingrediente na massa e na cobertura: soma (outra unidade: fica o 1º).
    if (igual) { if (igual[2] === l[2]) igual[1] = Math.min(MAX_QTD[l[2]], Math.round((igual[1] + l[1]) * 100) / 100); continue; }
    ingredientes.push(l);
    if (ingredientes.length >= MAX_ITENS) break;
  }
  // 1 item só serve quando é o próprio produto (revenda: "Água de coco").
  const palavrasProduto = new Set(normTexto(nomeProduto).split(' ').filter((w) => w.length > 2));
  const ehOProduto = ingredientes.length === 1 && normTexto(ingredientes[0][0]).split(' ').some((w) => palavrasProduto.has(w));
  if (ingredientes.length < 2 && !ehOProduto) return null;
  const kit = /\b(kit|kits|combo|combos|cesta|cestas)\b/.test(normTexto(nomeProduto));
  const r = kit ? 1 : Math.round(Number(json.rende));
  const porcao = kit ? 'kit' : singularPorcao(json.porcao);
  return {
    id: 'ia',
    nome: capitalizar(nomeProduto),
    porcao: [porcao, pluralSimples(porcao)],
    rende: Number.isFinite(r) ? Math.min(MAX_RENDE, Math.max(1, r)) : 1,
    ingredientes,
    embalagem: embalagemValida(json.embalagem),
  };
}

/** "1 fatia", "fatias", "Porção" → "fatia", "porção" (com acento). */
function singularPorcao(p) {
  const w = String(p ?? '').trim().toLowerCase().split(/\s+/).find((x) => x && !/^\d/.test(x)) || '';
  if (!w || w.length > 20) return 'unidade';
  if (/ões$/.test(w)) return w.replace(/ões$/, 'ão');
  if (/ães$/.test(w)) return w.replace(/ães$/, 'ão');
  if (/éis$/.test(w)) return w.replace(/éis$/, 'el');
  if (/[^s]s$/.test(w) && w.length > 3) return w.slice(0, -1);
  return w;
}

/** Embalagem de verdade ou null ("N/A", "-", "nada", número, objeto). */
function embalagemValida(e) {
  if (typeof e !== 'string') return null;
  const t = e.trim();
  const n = normTexto(t);
  if (n.length < 3 || t.length > 60 || /^(nenhum|nenhuma|sem|nao|nada|n a|na)( |$)/.test(n)) return null;
  return [capitalizar(t), null];
}

/** Nomes comuns que a IA escreve diferente da biblioteca (chave normTexto). */
const APELIDOS = {
  ovo: 'Ovos', 'ovo inteiro': 'Ovos', manteiga: 'Manteiga sem sal', leite: 'Leite integral',
  acucar: 'Açúcar refinado', 'acucar branco': 'Açúcar refinado', farinha: 'Farinha de trigo',
  oleo: 'Óleo de soja', 'oleo vegetal': 'Óleo de soja', 'fermento em po': 'Fermento químico',
  'fermento quimico em po': 'Fermento químico', 'fermento para bolo': 'Fermento químico',
  'chocolate em po': 'Chocolate em pó 50%', maizena: 'Amido de milho', 'sal refinado': 'Sal',
  mucarela: 'Mussarela', 'queijo mucarela': 'Mussarela', 'queijo mussarela': 'Mussarela',
  'creme de leite de caixinha': 'Creme de leite', 'essencia de baunilha': 'Essência de baunilha',
  requeijao: 'Requeijão cremoso', 'queijo mussarela ralado': 'Mussarela', 'mussarela ralada': 'Mussarela',
  'queijo ralado': 'Queijo parmesão', canela: 'Canela em pó', 'cheiro verde': 'Cheiro-verde', aipim: 'Mandioca', macaxeira: 'Mandioca',
  'queijo parmesao ralado': 'Queijo parmesão', 'parmesao ralado': 'Queijo parmesão', parmesao: 'Queijo parmesão',
  'cacau em po': 'Cacau em pó 100%', 'creme de avela': 'Nutella', 'creme de avela com cacau': 'Nutella',
  catupiry: 'Requeijão cremoso', 'requeijao tipo catupiry': 'Requeijão cremoso', azeite: 'Azeite de oliva',
  'azeite extra virgem': 'Azeite de oliva', 'azeite de oliva extra virgem': 'Azeite de oliva',
  'fermento biologico': 'Fermento biológico seco', 'fermento biologico instantaneo': 'Fermento biológico seco',
  'arroz branco': 'Arroz', 'arroz agulhinha': 'Arroz', feijao: 'Feijão carioca', 'milho verde': 'Milho em conserva',
  ervilha: 'Ervilha em conserva', 'ervilha fresca': 'Ervilha em conserva',
  'oleo para fritar': 'Óleo de soja', 'oleo para fritura': 'Óleo de soja',
  morango: 'Morango fresco', morangos: 'Morango fresco', calabresa: 'Linguiça calabresa', 'linguica': 'Linguiça calabresa',
  'carne bovina': 'Carne bovina (paleta)',
  'granulado de chocolate': 'Chocolate granulado', granulado: 'Chocolate granulado', 'confeito de chocolate': 'Chocolate granulado',
  'confeitos de chocolate': 'Chocolate granulado', 'confeito colorido': 'Confeitos coloridos', 'confeito de acucar': 'Confeitos coloridos',
  'confeito de acucar colorido': 'Confeitos coloridos', 'chocolate amargo': 'Chocolate meio amargo', 'chocolate em barra': 'Chocolate meio amargo',
  'chocolate gotas': 'Gotas de chocolate', 'banana nanica': 'Banana', 'banana prata': 'Banana', 'corante em gel vermelho': 'Corante gel vermelho',
  'corante em gel': 'Corante gel vermelho', 'corante vermelho': 'Corante gel vermelho', 'amendoim torrado sem sal': 'Amendoim torrado',
  'cravo em po': 'Cravo da índia', cravo: 'Cravo da índia', 'po para sabor morango': 'Gelatina de morango', gema: 'Ovos', gemas: 'Ovos',
  'gema de ovo': 'Ovos', 'gemas de ovo': 'Ovos', clara: 'Ovos', claras: 'Ovos', 'clara de ovo': 'Ovos', 'claras de ovo': 'Ovos',
  'leite de vaca': 'Leite integral', 'fuba de milho': 'Fubá', 'pao para hamburguer': 'Pão de hambúrguer', 'camarao fresco': 'Camarão',
  oregao: 'Orégano', 'pao frances': 'Pão francês', 'paes franceses': 'Pão francês',
  'carne bovina moida': 'Carne moída', 'hamburguer bovino': 'Carne moída', 'hamburguer de carne': 'Carne moída', 'blend bovino': 'Carne moída',
  'carne moida de picanha': 'Picanha', 'carne de picanha moida': 'Picanha', 'pao de hamburger': 'Pão de hambúrguer',
  'pao de cachorro': 'Pão de hot dog', 'pao de cachorro quente': 'Pão de hot dog', 'pao para hot dog': 'Pão de hot dog', 'pao para cachorro quente': 'Pão de hot dog',
  'queijo mozarela': 'Mussarela', mozarela: 'Mussarela', mozzarella: 'Mussarela', muzzarela: 'Mussarela', 'queijo catupiry': 'Requeijão cremoso',
  'queijo cheddar cremoso': 'Cheddar cremoso', 'fatia de queijo cheddar': 'Cheddar fatiado', 'queijo cheddar fatiado': 'Cheddar fatiado',
  'queijo cheddar': 'Cheddar fatiado', 'fatia de queijo': 'Mussarela', 'bacon em fatias': 'Bacon', 'fatia de bacon': 'Bacon', 'fatias de bacon': 'Bacon',
  azeitona: 'Azeitona verde', 'linguica calabresa fresca': 'Linguiça toscana', salmao: 'Salmão fresco', 'creme cheese': 'Cream cheese',
  'pepino japones': 'Pepino', 'manjericao fresco': 'Manjericão', 'bife de alcatra': 'Alcatra', 'bacalhau dessalgado': 'Bacalhau', origanos: 'Orégano',
  'contrafile bovino': 'Contrafilé', 'contra file': 'Contrafilé', champignon: 'Champignon em conserva', 'frango em pedacos': 'Coxa e sobrecoxa',
  'feijao carioquinha': 'Feijão carioca', 'massa de lasanha': 'Massa para lasanha', trigo: 'Farinha de trigo', atum: 'Atum em lata',
  'macarrao para yakissoba': 'Macarrão para yakisoba', 'goma de mandioca': 'Goma de tapioca', 'patinho moido': 'Patinho', espaguete: 'Macarrão',
  'polpa de tomate': 'Molho de tomate', pomodoro: 'Molho de tomate', 'queijo mucarela ralado': 'Mussarela', 'queijo mucarela': 'Mussarela',
  'mucarela ralada': 'Mussarela', mucarela: 'Mussarela', 'cominho em po': 'Cominho', 'louro em folha': 'Louro', 'folha de louro': 'Louro',
  'trigo para quibe': 'Trigo para kibe', 'hortela fresca': 'Hortelã', 'file de peito de frango': 'Peito de frango', 'file de frango': 'Peito de frango',
  acai: 'Polpa de açaí', 'acai polpa': 'Polpa de açaí', 'sorvete de creme': 'Sorvete cremoso', aveia: 'Aveia em flocos', 'farinha de aveia': 'Aveia em flocos',
  refrigerante: 'Refrigerante 2L', 'molho de soja': 'Molho shoyu', 'arroz para sushi': 'Arroz japonês', 'gengibre fresco': 'Gengibre', 'peito de frango desfiado': 'Peito de frango', 'limao tahiti': 'Limão',
  salsa: 'Salsinha', 'file de tilapia': 'Tilápia', 'costela bovina moida': 'Costela bovina',
};
const PREPARO = /\b(?:e )?(morno|morna|gelado|gelada|quente|derretido|derretida|amolecido|amolecida|picado|picada|picadinho|em cubos|em tiras|em rodelas|fatiado|fatiada|cozido|cozida|refogado|refogada|sem pele|sem semente|sem sementes|em temperatura ambiente|peneirado|peneirada|a gosto|bem gelado|bem gelada|para fritura|para fritar|para untar|para polvilhar|para pincelar|triturado|triturada|cru|crua)(?: e(?= |$))?/g;
/** Palavras que a IA às vezes escreve sem acento. */
const ACENTOS = {
  camarao: 'camarão', pimentao: 'pimentão', dende: 'dendê', acucar: 'açúcar', limao: 'limão', feijao: 'feijão',
  mamao: 'mamão', pao: 'pão', paes: 'pães', po: 'pó', file: 'filé', acem: 'acém', oregano: 'orégano', cafe: 'café',
  tilapia: 'tilápia', maracuja: 'maracujá', acai: 'açaí', pessego: 'pêssego', abobora: 'abóbora', brocolis: 'brócolis',
  agriao: 'agrião', alcaparra: 'alcaparra', gengibre: 'gengibre', pure: 'purê', creme: 'creme', graos: 'grãos', grao: 'grão',
  linguica: 'linguiça', calabresa: 'calabresa', requeijao: 'requeijão', parmesao: 'parmesão', avela: 'avelã', amendoa: 'amêndoa',
  amendoas: 'amêndoas', pacoca: 'paçoca', acafrao: 'açafrão', oleo: 'óleo', maca: 'maçã', cachaca: 'cachaça', poro: 'poró', mae: 'mãe',
  padrao: 'padrão', hortela: 'hortelã', fuba: 'fubá', acucarado: 'açucarado', frances: 'francês', suino: 'suíno', suina: 'suína',
  salmao: 'salmão', japones: 'japonês', pure: 'purê', mocoto: 'mocotó', abobora: 'abóbora', file: 'filé', sirio: 'sírio', cha: 'chá', soluvel: 'solúvel', cupuacu: 'cupuaçu', gas: 'gás', tonica: 'tônica',
  macarrao: 'macarrão', essencia: 'essência', algodao: 'algodão', limao: 'limão',
};
function acentuar(nome) {
  return String(nome).split(' ').map((w) => {
    const r = ACENTOS[normTexto(w)];
    if (!r || r === w.toLowerCase()) return w;
    return w[0] === w[0].toUpperCase() ? r[0].toUpperCase() + r.slice(1) : r;
  }).join(' ');
}

const AGUA = /^(agua|gelo)( (filtrada|morna|quente|fria|gelada|potavel|natural|em temperatura ambiente))?$/;

/**
 * Receita da IA com os nomes da biblioteca ("Ovo" → "Ovos", "Acucar mascavo" →
 * "Açúcar mascavo"), para casar com o preço médio e com os da conta. Água e
 * gelo saem (não custam). Dois itens que viram o mesmo nome (e a mesma
 * unidade) somam.
 * conhecidos: nomes de ingredientes da biblioteca.
 */
export function canonizarReceita(receita, conhecidos) {
  if (!receita || !Array.isArray(receita.ingredientes)) return receita || null;
  const porChave = new Map();
  for (const n of conhecidos || []) { const k = normTexto(n); if (k && !porChave.has(k)) porChave.set(k, n); }
  const procurar = (k) => porChave.get(k) || APELIDOS[k] || porChave.get(`${k}s`) || (k.endsWith('s') ? porChave.get(k.slice(0, -1)) : null);
  const achar = (nome) => {
    const k = normTexto(nome);
    const direto = procurar(k);
    if (direto) return direto;
    // "Leite morno", "Frango em cubos", "Manteiga derretida": o jeito de
    // preparar não muda o que se compra.
    const limpo = k.replace(PREPARO, ' ').replace(/\s+/g, ' ').trim();
    if (limpo && limpo !== k) return procurar(limpo) || acentuar(capitalizar(limpo));
    return acentuar(nome);
  };
  const saida = [];
  for (const [nome, q, un] of receita.ingredientes) {
    const k0 = normTexto(nome);
    if (AGUA.test(k0)) continue;
    const n = k0 === 'milho verde' && un === 'un' ? 'Espiga de milho verde' // 12 espigas, não 12 latas
      : /^gom\w* de tapioca$/.test(k0) ? 'Goma de tapioca'
        : achar(nome);
    const igual = saida.find((i) => i[0] === n && i[2] === un);
    if (igual) igual[1] = Math.min(MAX_QTD[un] || Infinity, Math.round((igual[1] + q) * 100) / 100);
    else if (!saida.some((i) => i[0] === n)) saida.push([n, q, un]);
  }
  return { ...receita, ingredientes: saida };
}

export function pluralSimples(p) {
  const t = String(p || '');
  if (!t) return 'unidades';
  if (t === 'pão') return 'pães';
  if (t.endsWith('ão')) return t.slice(0, -2) + 'ões';
  if (/[rsz]$/.test(t)) return t + 'es';
  if (t.endsWith('el')) return t.slice(0, -2) + 'éis';
  if (t.endsWith('l')) return t.slice(0, -1) + 'is';
  if (t.endsWith('m')) return t.slice(0, -1) + 'ns';
  return t + 's';
}

const LIQUIDO = /^(leite|agua|oleo|azeite|suco|leite de coco|creme de leite fresco|vinagre|cafe)( |$)/;
const liquido = (n) => LIQUIDO.test(n) && !/(condensado|em po|soluvel|ninho)/.test(n);
/** Medidas de casa → [quantidade, unidade] para 1 medida, pelo ingrediente. */
const MEDIDAS = [
  [/^latas?$/, (n) => (/creme de leite/.test(n) ? [300, 'g'] : /(milho|ervilha|seleta)/.test(n) ? [200, 'g'] : [395, 'g'])],
  [/^caix(a|inha)s?$/, (n) => (/^leite( integral| desnatado)?$/.test(n) ? [1000, 'ml'] : [200, 'g'])],
  [/^xic(ara)?s?$/, (n) => (liquido(n) ? [240, 'ml'] : /condensado/.test(n) ? [300, 'g'] : /acucar/.test(n) ? [180, 'g']
    : /(farinha|amido|fuba|aveia)/.test(n) ? [120, 'g'] : /(chocolate|cacau|leite em po|ninho|coco)/.test(n) ? [100, 'g'] : [150, 'g'])],
  [/^colher(es)? cafe$/, (n) => [2, liquido(n) ? 'ml' : 'g']],
  [/^colher(es)? cha$/, (n) => [5, liquido(n) ? 'ml' : 'g']],
  [/^colher(es)?( sopa)?$/, (n) => [15, liquido(n) ? 'ml' : 'g']],
  [/^dentes?$/, () => [5, 'g']],
  [/^pitadas?$/, () => [1, 'g']],
  [/^(dz|duzias?)$/, () => [12, 'un']],
  [/^bandejas?$/, () => [30, 'un']],
  [/^(macos?|molhos?)$/, () => [100, 'g']],
];
const UNIDADE_TEXTO = /^(kg|kilos?|quilos?|gr|g|gramas?|ml|l|litros?|un|unid|unidades?)\.?(?=\s|$)/i;
const MEDIDA_TEXTO = /^(latas?|caix(?:a|inha)s?|x[ií]c(?:aras?)?\.?|colher(?:es)?(?:\s*\(?(?:de\s+)?(?:sopa|ch[aá]|caf[eé])\)?)?|dentes?|pitadas?|dz|d[uú]zias?|bandejas?|ma[cç]os?)(?=\s|$)/i;
const QUALIFICA = /^(\((ch[aá]|sopa|caf[eé])\)|de (ch[aá]|sopa|caf[eé])(?= de )|rasas?|cheias?|bem cheias?)\s*/i;
const NUMERO_PALAVRA = { meia: '0.5', meio: '0.5', uma: '1', um: '1', duas: '2', dois: '2', tres: '3', três: '3' };

/** "1/2", "1.000", "1,5", "1 e 1/2" → número. */
function lerNumero(t) {
  const misto = t.match(/^(\d+)\s+e\s+(\d+)\/(\d+)$/);
  if (misto) return Number(misto[1]) + Number(misto[2]) / Number(misto[3]);
  const f = t.match(/^(\d+)\/(\d+)$/);
  if (f) return Number(f[2]) > 0 ? Number(f[1]) / Number(f[2]) : NaN;
  const x = /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t.replace(',', '.');
  return Number(x);
}
const NUM = String.raw`\d+(?:[.,]\d+)*(?:\s+e\s+\d+\/\d+|\/\d+)?`;

/**
 * "+ Outro ingrediente": "100 g de coco ralado", "2 ovos", "1/2 kg de carne",
 * "meia xícara de açúcar", "2 kg e 500 g de carne", "1 dz de ovos",
 * "1 lata de leite condensado", "2 cebolas".
 * conhecidos (opcional): nomes da biblioteca, para o nome casar com o preço
 * médio ("farinha" → "Farinha de trigo", "cebolas" → "Cebola").
 * @returns {[nome, q, un]|null}
 */
export function lerOutro(texto, conhecidos) {
  let t = String(texto ?? '').trim().replace(/\s+/g, ' ');
  const pal = t.match(/^(\S+)\s/);
  if (pal && NUMERO_PALAVRA[pal[1].toLowerCase()]) t = NUMERO_PALAVRA[pal[1].toLowerCase()] + t.slice(pal[1].length);
  const m = t.match(new RegExp(`^(${NUM})\\s*(.+)$`));
  if (!m) return null;
  let q = lerNumero(m[1]);
  let resto = m[2].trim();
  let un = null;
  let medida = null;
  resto = resto.replace(/^de\s+(?=(x[ií]c|colher|lata|caix|d[uú]z|dz|bandeja|ma[cç]o))/i, ''); // "1/4 de xícara"
  const u = resto.match(UNIDADE_TEXTO);
  const md = u ? null : resto.match(MEDIDA_TEXTO);
  if (u) {
    un = unidadeValida(u[1]);
    resto = resto.slice(u[0].length).trim();
    // "2 kg e 500 g de carne"
    const mais = resto.match(new RegExp(`^e (${NUM})\\s*(kg|kilos?|quilos?|gr|g|gramas?|ml|l|litros?)\\.?(?=\\s|$)`, 'i'));
    if (mais && un) {
      const un2 = unidadeValida(mais[2]);
      const base = (x, w) => (w === 'kg' || w === 'l' ? x * 1000 : x);
      const fim = un === 'kg' || un === 'l' ? (un === 'kg' ? 'g' : 'ml') : un;
      if (un2 && (base(1, un) && ((un === 'kg' || un === 'g') === (un2 === 'kg' || un2 === 'g')))) {
        q = base(q, un) + base(lerNumero(mais[1]), un2); un = fim; resto = resto.slice(mais[0].length).trim();
      }
    }
  } else if (md) {
    medida = normTexto(md[1]).replace(/\b(de)\b/g, ' ').replace(/\s+/g, ' ').trim();
    resto = resto.slice(md[0].length).trim();
  }
  while (QUALIFICA.test(resto)) {
    const k = resto.match(QUALIFICA)[0];
    if (medida && /^colher/.test(medida) && /(ch[aá]|caf[eé]|sopa)/i.test(k)) medida = `colher ${normTexto(k).replace(/\b(de)\b/g, '').trim()}`;
    resto = resto.slice(k.length).trim();
  }
  resto = resto.replace(/^(de|do|da|dos|das)\s+/i, '').trim();
  if (!resto || /^(e\s|\d)/i.test(resto)) return null;
  const nome = conhecidos ? (canonizarReceita({ ingredientes: [[resto, 1, 'g']] }, conhecidos).ingredientes[0]?.[0] || resto) : resto;
  const n = normTexto(nome);
  if (medida) {
    const regra = MEDIDAS.find(([re]) => re.test(medida));
    const [qtd, u2] = regra ? regra[1](n) : [1, 'g'];
    q *= qtd; un = u2;
  } else if (!un) {
    if (/(ovo|unidade)/i.test(resto)) un = 'un';
    else if (pesoUn(n)) { q *= pesoUn(n); un = 'g'; }
    else if (precoMedio(nome, 'un') != null) un = 'un';
    else if (/^\S+s( |$)/i.test(resto) || q <= 20) un = 'un';
    else un = 'g';
  }
  return limparLinha(nome, Math.round(q * 100) / 100, un);
}

const FRITO = /\b(coxinhas?|past(el|eis)|kibes?|quibes?|bolinhos? de (bacalhau|queijo|carne|aipim|mandioca|chuva)|risoles?|croquetes?|acaraje|fogazzas?|churros?|a passarinho|batata frita|fritas|mandioca frita|isca|frito|frita|fritos|fritas|sonhos?|enroladinhos?|bolinhas? de queijo)\b/;
const ASSADO = /\b(assad[oa]s?|forno|air ?fryer|fit)\b/;
/**
 * Produto frito sem o óleo da fritura (a IA às vezes esquece): põe 500 ml de
 * óleo de soja, o que uma fritada gasta. Óleo com menos de 300 ml num frito
 * era o da massa: sobe para 500.
 */
export function garantirOleoFritura(receita, nomeProduto) {
  if (!receita || !Array.isArray(receita.ingredientes)) return receita;
  const n = normTexto(nomeProduto);
  if (!FRITO.test(n) || ASSADO.test(n)) return receita;
  const ing = receita.ingredientes.map((i) => [...i]);
  const oleo = ing.find((i) => /^oleo/.test(normTexto(i[0])) && i[2] === 'ml');
  if (oleo) { if (oleo[1] < 300) oleo[1] = 500; } else ing.push(['Óleo de soja', 500, 'ml']);
  return { ...receita, ingredientes: ing };
}

/**
 * Sugestão completa para a tela: receita (biblioteca ou IA) ou a lista do
 * nicho. Cada ingrediente já com o preço (conta > base > null).
 * precosConta: Map normTexto(nome) → { id, preco, un } dos ingredientes da conta.
 */
export function montarSugestao({ receita, nicho, ingredientesPorNicho, embalagemPorNicho, precosConta, porcaoPorNicho }) {
  const conta = precosConta instanceof Map ? precosConta : new Map();
  const [porcaoNicho, rendeNicho] = (porcaoPorNicho && porcaoPorNicho[nicho]) || [['unidade', 'unidades'], 10];
  const base = receita || {
    id: 'nicho',
    nome: '',
    porcao: porcaoNicho,
    rende: rendeNicho,
    ingredientes: (ingredientesPorNicho && ingredientesPorNicho[nicho]) || [],
    embalagem: (embalagemPorNicho && embalagemPorNicho[nicho]) || null,
  };
  const item = (nome, q, un, emb, precoSugerido) => {
    const c = conta.get(normTexto(nome));
    const daConta = c && c.un === un && Number(c.preco) > 0;
    const medio = emb ? (Number(precoSugerido) > 0 ? Number(precoSugerido) : precoMedio(nome, 'un')) : precoMedio(nome, un);
    return { nome, q, un, emb, preco: daConta ? Number(c.preco) : medio, contaId: daConta ? c.id : null, contaTabela: daConta ? (c.tabela || null) : null, estimado: !daConta && medio != null };
  };
  const itens = (base.ingredientes || []).map(([n, q, un]) => {
    // "2 cebolas": a base vende por kg; vira gramas pelo peso médio.
    // Café pronto em ml: café em pó (coado ~70 g por litro; espresso ~9 g em 30 ml).
    if (un === 'ml' && /^cafe( coado| passado| forte| preto)?$/.test(normTexto(n))) return item('Café em pó', Math.max(1, Math.round(q * 0.07)), 'g', false);
    if (un === 'ml' && /^cafe (espresso|expresso)$/.test(normTexto(n))) return item('Café em pó', Math.max(1, Math.round(q * 0.3)), 'g', false);
    // "Caldo de carne 1000 ml" é o caldo pronto: 1 tablete de 10 g faz 500 ml.
    if (un === 'ml' && /^caldo (de )?(carne|galinha|legumes|frango|peixe)/.test(normTexto(n))) {
      return item(n, Math.max(1, Math.round(q / 50)), 'g', false);
    }
    const peso = PESO_UN[normTexto(n)];
    const daConta = conta.get(normTexto(n));
    if (un === 'un' && peso && !(daConta && daConta.un === 'un') && precoMedio(n, 'un') == null) {
      return item(n, Math.round(q * peso), 'g', false);
    }
    return item(n, q, un, false);
  });
  if (base.embalagem) itens.push(item(base.embalagem[0], 1, 'un', true, base.embalagem[1]));
  return { fonte: receita ? (receita.id === 'ia' ? 'ia' : 'biblioteca') : 'nicho', porcao: base.porcao, rende: base.rende, itens };
}
