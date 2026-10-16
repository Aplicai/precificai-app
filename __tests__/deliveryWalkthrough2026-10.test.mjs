/**
 * Walkthrough Delivery / Lista de Compras (2026-10).
 *
 *  1. Adicionar plataforma pelo Delivery gravava 0% de comissão e 0 de taxa,
 *     até pelo atalho "iFood" → taxasPadraoDaPlataforma (fonte única).
 *  2. Popup "Editar preço por plataforma" ignorava a embalagem de delivery
 *     (Mesmo lucro R$ 12,84 no popup x R$ 14,78 na tabela) → o popup usa o
 *     mesmo custo no delivery (cmv + embalagem) da Visão Geral.
 *  3. Primeira tecla engolida em campos com "selecionar tudo ao focar"
 *     ("140,00" → "40,00", "12" → "2") → selecionarAoFocar.
 *  5. Quantidades da lista com ponto ("1.27 kg") → formatQtdLista.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  PLATAFORMAS_PADRAO, plataformaPadraoPorNome, taxasPadraoDaPlataforma,
} from '../src/utils/deliveryPlataformasPadrao.js';
import { criarSelecionarAoFocar, selecionarTudoAoFocarProps } from '../src/utils/selecionarAoFocar.js';
import { formatQtdLista } from '../src/utils/listaComprasFormat.js';
import { calcPrecoMesmoLucroReais } from '../src/utils/deliveryPricing.js';
import { custoDelivery, embalagemDeliveryDoProduto } from '../src/utils/deliveryAdapter.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const fonte = (rel) => readFileSync(join(raiz, rel), 'utf8');

// ─── 1. Taxas padrão ao adicionar plataforma ───────────────────────────
test('iFood (atalho e digitado) entra com 27% de comissão e 3,2% de pagamento online', () => {
  for (const nome of ['iFood', 'ifood', ' IFOOD ', 'i food', 'iFood Loja 2']) {
    assert.deepEqual(taxasPadraoDaPlataforma(nome), {
      taxa_plataforma: 27, taxa_entrega: 0, comissao_app: 3.2, desconto_promocao: 0,
    }, nome);
  }
});

test('outras plataformas conhecidas casam pelo nome ou pela primeira palavra', () => {
  assert.equal(taxasPadraoDaPlataforma('Rappi').taxa_plataforma, 25);
  assert.equal(taxasPadraoDaPlataforma('Uber Eats').taxa_plataforma, 30);
  assert.equal(taxasPadraoDaPlataforma('Uber').taxa_plataforma, 30);
  assert.equal(taxasPadraoDaPlataforma('99Food').taxa_plataforma, 22);
  assert.equal(plataformaPadraoPorNome('99 Food')?.plataforma, '99Food');
});

test('plataforma desconhecida ou canal próprio entra sem taxas', () => {
  const zero = { taxa_plataforma: 0, taxa_entrega: 0, comissao_app: 0, desconto_promocao: 0 };
  assert.deepEqual(taxasPadraoDaPlataforma('Venda Direta'), zero);
  assert.deepEqual(taxasPadraoDaPlataforma('Minha Loja'), zero);
  assert.deepEqual(taxasPadraoDaPlataforma(''), zero);
  assert.deepEqual(taxasPadraoDaPlataforma(null), zero);
  assert.equal(plataformaPadraoPorNome('   '), null);
});

test('PLATAFORMAS_PADRAO não pode ser alterada por quem importa', () => {
  assert.ok(Object.isFrozen(PLATAFORMAS_PADRAO));
  const r = taxasPadraoDaPlataforma('iFood');
  r.taxa_plataforma = 99;
  assert.equal(taxasPadraoDaPlataforma('iFood').taxa_plataforma, 27);
});

test('Hub e tela de Plataformas usam a fonte única ao criar plataforma', () => {
  const hub = fonte('src/screens/DeliveryHubScreen.js');
  assert.match(hub, /taxasPadraoDaPlataforma\(nome\)/);
  assert.doesNotMatch(hub, /\[newPlatNome\.trim\(\), 0, 0, 0, 0, 1\]/);
  const plats = fonte('src/screens/DeliveryPlataformasScreen.js');
  assert.match(plats, /taxasPadraoDaPlataforma\(nome\)/);
  // Chip passava pelo setTimeout com closure velha (nome vazio) e não adicionava.
  assert.doesNotMatch(plats, /setTimeout\(\(\) => adicionarPlataforma\(\)/);
});

// ─── 2. Popup x tabela: mesmo custo no delivery ────────────────────────
test('Mesmo lucro com embalagem de delivery é maior que sem ela (diferença = embalagem / divisor)', () => {
  const plat = { taxa_plataforma: 27, comissao_app: 3.2, taxa_entrega: 0, desconto_promocao: 0 };
  const contexto = { fixoPerc: 0.1, impostoPerc: 0.06 };
  const cmv = 4;
  const produto = { embalagem_delivery_id: 7, embalagem_delivery_quantidade: 1 };
  const emb = embalagemDeliveryDoProduto(produto, [{ id: 7, nome: 'Caixa', preco_unitario: 1.2 }]);
  const cmvDelivery = custoDelivery({ cmv, embalagemDeliveryPreco: emb.preco, embalagemDeliveryQtd: emb.qtd });
  assert.equal(cmvDelivery, 5.2);
  const semEmb = calcPrecoMesmoLucroReais({ cmv, lucroAlvoReais: 3, plat, contexto });
  const comEmb = calcPrecoMesmoLucroReais({ cmv: cmvDelivery, lucroAlvoReais: 3, plat, contexto });
  assert.ok(Math.abs((comEmb.preco - semEmb.preco) - 1.2 / comEmb.divisor) < 1e-9);
});

test('popup (SimulacaoProduto) e tabela (SimuladorLote) passam o custo no delivery ao Mesmo lucro', () => {
  const popup = fonte('src/screens/SimulacaoProdutoScreen.js');
  assert.match(popup, /calcPrecoMesmoLucroReais\(\{ cmv: cmvDelivery,/);
  assert.match(popup, /calcSugestaoDeliveryCompleta\(\{ cmv: cmvDelivery,/);
  assert.match(popup, /embalagemDeliveryDoProduto\(prod,/);
  const tabela = fonte('src/screens/SimuladorLoteScreen.js');
  assert.match(tabela, /cmv: prod\.cmvDelivery,\s*lucroAlvoReais/);
});

// ─── 3. Selecionar tudo ao focar sem engolir a primeira tecla ──────────
function fakeInput(value) {
  return {
    value,
    selecionado: false,
    select() { this.selecionado = true; },
  };
}

test('foco seleciona o texto na hora (antes de qualquer tecla)', () => {
  const node = fakeInput('15,20');
  const pendentes = [];
  const onFocus = criarSelecionarAoFocar({ agendar: (fn) => pendentes.push(fn), elementoAtivo: () => node });
  onFocus({ target: node });
  assert.equal(node.selecionado, true);
});

test('timer atrasado NÃO re-seleciona depois que a pessoa digitou ("140,00" não vira "40,00")', () => {
  const node = fakeInput('15,20');
  const pendentes = [];
  const onFocus = criarSelecionarAoFocar({ agendar: (fn) => pendentes.push(fn), elementoAtivo: () => node });
  onFocus({ target: node });
  node.selecionado = false;
  node.value = '1'; // primeira tecla chegou antes do timer
  pendentes.forEach((fn) => fn());
  assert.equal(node.selecionado, false);
});

test('timer re-seleciona quando nada foi digitado (Safari desfaz a seleção no mouseup)', () => {
  const node = fakeInput('0');
  const pendentes = [];
  const onFocus = criarSelecionarAoFocar({ agendar: (fn) => pendentes.push(fn), elementoAtivo: () => node });
  onFocus({ target: node });
  node.selecionado = false; // mouseup desfez
  pendentes.forEach((fn) => fn());
  assert.equal(node.selecionado, true);
});

test('não seleciona se o campo já perdeu o foco ou o evento não tem input', () => {
  const node = fakeInput('0');
  const onFocus = criarSelecionarAoFocar({ agendar: () => {}, elementoAtivo: () => null });
  onFocus({ target: node });
  assert.equal(node.selecionado, false);
  assert.doesNotThrow(() => onFocus(undefined));
  assert.doesNotThrow(() => onFocus({ target: {} }));
});

test('props: web usa onFocus próprio; nativo mantém selectTextOnFocus', () => {
  const web = selecionarTudoAoFocarProps('web');
  assert.equal(typeof web.onFocus, 'function');
  assert.equal(web.selectTextOnFocus, undefined);
  assert.deepEqual(selecionarTudoAoFocarProps('ios'), { selectTextOnFocus: true });
});

test('Lista de Compras e popup do Delivery não usam mais o selectTextOnFocus do RN-web', () => {
  for (const rel of ['src/screens/ListaComprasScreen.js', 'src/screens/SimulacaoProdutoScreen.js']) {
    const src = fonte(rel);
    assert.doesNotMatch(src, /^\s*selectTextOnFocus\s*$/m, rel);
    assert.match(src, /selecionarTudoAoFocarProps\(Platform\.OS\)/, rel);
  }
});

test('nenhuma tela/componente usa selectTextOnFocus direto (só via selecionarTudoAoFocarProps)', () => {
  // Exceções explícitas só-nativo: nenhuma hoje. Se surgir, liste aqui o arquivo
  // e garanta que o prop está atrás de `Platform.OS !== 'web'`.
  const NATIVE_ONLY = new Set();
  const listar = (dir) => readdirSync(join(raiz, dir), { withFileTypes: true }).flatMap((d) => {
    const rel = `${dir}/${d.name}`;
    if (d.isDirectory()) return listar(rel);
    return /\.(js|jsx|ts|tsx)$/.test(d.name) ? [rel] : [];
  });
  const ofensores = [];
  for (const rel of [...listar('src/screens'), ...listar('src/components')]) {
    if (NATIVE_ONLY.has(rel)) continue;
    const semComentarios = fonte(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    if (/\bselectTextOnFocus\b/.test(semComentarios)) ofensores.push(rel);
  }
  assert.deepEqual(ofensores, []);
});

// ─── 5. Quantidade da lista em PT-BR ──────────────────────────────────
test('formatQtdLista: vírgula decimal, 2 casas na fração, inteiro sem casas', () => {
  assert.equal(formatQtdLista(1.27), '1,27');
  assert.equal(formatQtdLista(1.13), '1,13');
  assert.equal(formatQtdLista(3.7), '3,70');
  assert.equal(formatQtdLista(810), '810');
  assert.equal(formatQtdLista(12), '12');
  assert.equal(formatQtdLista(NaN), '0');
});

test('Lista de Compras não formata quantidade com toFixed (ponto) na tela nem no PDF', () => {
  const src = fonte('src/screens/ListaComprasScreen.js');
  assert.doesNotMatch(src, /displayQty\.toFixed/);
  assert.ok((src.match(/formatQtdLista\(item\.displayQty\)/g) || []).length >= 3);
});
