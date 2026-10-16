/**
 * Testes — src/utils/primeiroProduto.js (primeiro acesso guiado, 15/10/2026).
 *
 * O ponto mais perigoso é a unidade: "Comprei 5 kg, uso 300 g" grava a
 * quantidade NA UNIDADE DO INGREDIENTE (0,3 kg), porque todas as telas leem
 * produto_ingredientes.quantidade_utilizada com a unidade do ingrediente.
 *
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/primeiroProduto.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  segmentoKeyDoTexto, sugestoesIngredientes, filtrarSugestoes, sugestoesProduto,
  prefillCompraDeTemplate, unidadesUsoPara, unidadeUsoPadrao, calcularLinha,
  nomesDuplicados, calcPrecoSugeridoProduto, camposRendimento, resumoReceita,
  montarPayloadPrimeiroProduto, linhaVazia,
} from '../src/utils/primeiroProduto.js';
import { calcMarkup, getDivisorRendimento } from '../src/utils/calculations.js';

const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} esperado ${b}, veio ${a}`);
const linha = (o) => ({ ...linhaVazia(), ...o });

test('segmento digitado vira o segmento do template', () => {
  assert.equal(segmentoKeyDoTexto('Confeitaria artesanal'), 'confeitaria');
  assert.equal(segmentoKeyDoTexto('Doces da Maria'), 'confeitaria');
  assert.equal(segmentoKeyDoTexto('bolos e tortas'), 'confeitaria');
  assert.equal(segmentoKeyDoTexto('Brigadeiros gourmet '), 'confeitaria');
  assert.equal(segmentoKeyDoTexto('Pizzaria'), 'pizzaria');
  assert.equal(segmentoKeyDoTexto('Açaí'), 'acai');
  assert.equal(segmentoKeyDoTexto('Cozinha oriental, sushi'), 'japonesa');
  assert.equal(segmentoKeyDoTexto('Sorvete '), 'sorveteria');
  assert.equal(segmentoKeyDoTexto('Espetinho do pônei'), 'salgaderia');
  assert.equal(segmentoKeyDoTexto("Felp's Burguer"), 'hamburgueria');
  assert.equal(segmentoKeyDoTexto('Lanches e delivery'), 'hamburgueria');
  assert.equal(segmentoKeyDoTexto('Padaria'), 'padaria');
  assert.equal(segmentoKeyDoTexto('Marmitas fit'), 'marmitaria');
  assert.equal(segmentoKeyDoTexto('Massas'), 'restaurante');
  assert.equal(segmentoKeyDoTexto('Doces e salgados '), 'confeitaria'); // o primeiro tema citado vence
  assert.equal(segmentoKeyDoTexto('Consultoria'), null);
  assert.equal(segmentoKeyDoTexto(''), null);
  assert.equal(segmentoKeyDoTexto(null), null);
});

test('sugestões de ingrediente: do segmento, sem embalagem/limpeza, sem repetir', () => {
  const conf = sugestoesIngredientes('confeitaria');
  assert.ok(conf.length > 10);
  assert.ok(conf.some((s) => s.nome === 'Farinha de trigo'));
  assert.ok(conf.every((s) => !/Embalage|Descart|Limpeza/i.test(s.categoria || '')));
  const nomes = conf.map((s) => s.nome.toLowerCase());
  assert.equal(new Set(nomes).size, nomes.length);
  const geral = sugestoesIngredientes(null);
  assert.ok(geral.length > 10);
  assert.ok(sugestoesIngredientes('confeitaria', 5).length <= 5);
});

test('filtro de sugestões ignora acento e o que já foi usado', () => {
  const lista = [{ nome: 'Açúcar refinado' }, { nome: 'Açúcar mascavo' }, { nome: 'Farinha de trigo' }];
  assert.deepEqual(filtrarSugestoes(lista, 'acucar', []).map((s) => s.nome), ['Açúcar refinado', 'Açúcar mascavo']);
  assert.deepEqual(filtrarSugestoes(lista, 'açúc', ['açúcar refinado']).map((s) => s.nome), ['Açúcar mascavo']);
  assert.equal(filtrarSugestoes(lista, '', []).length, 0);
  assert.equal(filtrarSugestoes(lista, 'a', [], 1).length, 1);
});

test('sugestões de produto: nomes simples, do segmento ou gerais', () => {
  assert.ok(sugestoesProduto('confeitaria').includes('Brigadeiro'));
  assert.ok(sugestoesProduto('hamburgueria').includes('Hambúrguer artesanal'));
  // Sem segmento (ou segmento que não reconhecemos): sugestões gerais, nunca vazio.
  assert.equal(sugestoesProduto(null).length, 6);
  assert.deepEqual(sugestoesProduto('xyz'), sugestoesProduto(null));
  // Nada de tamanho ou embalagem no nome ("caixa 12 un", "1kg"): isso é o
  // rendimento, perguntado logo abaixo.
  const todos = ['confeitaria', 'padaria', 'hamburgueria', 'pizzaria', 'restaurante', 'marmitaria', 'acai', 'cafeteria', 'sorveteria', 'salgaderia', 'japonesa', null]
    .flatMap((k) => sugestoesProduto(k));
  assert.ok(todos.every((n) => !/\d|\bun\b|\bkg\b|caixa/i.test(n)), todos.filter((n) => /\d|\bun\b|\bkg\b|caixa/i.test(n)).join(', '));
});

test('quantidade do template vira a frase de compra', () => {
  assert.deepEqual(prefillCompraDeTemplate({ quantidade_bruta: 1000, unidade_medida: 'g' }), { qtdCompra: '1', unCompra: 'kg' });
  assert.deepEqual(prefillCompraDeTemplate({ quantidade_bruta: 395, unidade_medida: 'g' }), { qtdCompra: '395', unCompra: 'g' });
  assert.deepEqual(prefillCompraDeTemplate({ quantidade_bruta: 1000, unidade_medida: 'mL' }), { qtdCompra: '1', unCompra: 'L' });
  assert.deepEqual(prefillCompraDeTemplate({ quantidade_bruta: 30, unidade_medida: 'un' }), { qtdCompra: '30', unCompra: 'un' });
  assert.deepEqual(prefillCompraDeTemplate({ quantidade_bruta: 2500, unidade_medida: 'g' }), { qtdCompra: '2,5', unCompra: 'kg' });
});

test('unidades de uso seguem o tipo da compra', () => {
  assert.deepEqual(unidadesUsoPara('kg'), ['g', 'kg']);
  assert.deepEqual(unidadesUsoPara('g'), ['g', 'kg']);
  assert.deepEqual(unidadesUsoPara('L'), ['mL', 'L']);
  assert.deepEqual(unidadesUsoPara('un'), ['un']);
  assert.equal(unidadeUsoPadrao('kg'), 'g');
  assert.equal(unidadeUsoPadrao('L'), 'mL');
  assert.equal(unidadeUsoPadrao('un'), 'un');
});

test('linha: 5 kg por R$ 25, uso 300 g', () => {
  const r = calcularLinha(linha({ nome: 'Farinha', qtdCompra: '5', unCompra: 'kg', valor: '25', qtdUso: '300', unUso: 'g' }));
  assert.equal(r.status, 'valida');
  perto(r.precoBase, 5, 'preço por kg');
  perto(r.custoNaReceita, 1.5, 'custo na receita');
  perto(r.qtdNaUnidadeDoInsumo, 0.3, 'quantidade gravada em kg');
  assert.equal(r.fraseCusto, 'Isso dá R$ 5,00 por kg');
});

test('linha: 500 g por R$ 10, uso 50 g (ingrediente em g grava em g)', () => {
  const r = calcularLinha(linha({ nome: 'Chocolate', qtdCompra: '500', unCompra: 'g', valor: '10', qtdUso: '50', unUso: 'g' }));
  perto(r.precoBase, 20);
  perto(r.custoNaReceita, 1);
  perto(r.qtdNaUnidadeDoInsumo, 50);
});

test('linha: unidade e litro', () => {
  const ovos = calcularLinha(linha({ nome: 'Ovos', qtdCompra: '12', unCompra: 'un', valor: '18', qtdUso: '2', unUso: 'un' }));
  perto(ovos.custoNaReceita, 3);
  perto(ovos.qtdNaUnidadeDoInsumo, 2);
  const leite = calcularLinha(linha({ nome: 'Leite', qtdCompra: '1', unCompra: 'L', valor: '6', qtdUso: '200', unUso: 'mL' }));
  perto(leite.custoNaReceita, 1.2);
  perto(leite.qtdNaUnidadeDoInsumo, 0.2);
});

test('linha: números em PT-BR', () => {
  const r = calcularLinha(linha({ nome: 'Manteiga', qtdCompra: '1,5', unCompra: 'kg', valor: '1.000,50', qtdUso: '100', unUso: 'g' }));
  perto(r.precoBase, 1000.5 / 1.5);
  perto(r.custoNaReceita, (1000.5 / 1.5) * 0.1);
});

test('linha vazia, incompleta e com zero', () => {
  assert.equal(calcularLinha(linhaVazia()).status, 'vazia');
  const inc = calcularLinha(linha({ nome: 'Farinha', qtdCompra: '5' }));
  assert.equal(inc.status, 'incompleta');
  assert.ok(inc.erros.valor && inc.erros.qtdUso);
  const zero = calcularLinha(linha({ nome: 'Farinha', qtdCompra: '5', valor: '0', qtdUso: '100' }));
  assert.equal(zero.status, 'incompleta');
  assert.ok(zero.erros.valor);
  const semNome = calcularLinha(linha({ qtdCompra: '5', valor: '25', qtdUso: '100' }));
  assert.equal(semNome.status, 'incompleta');
  assert.ok(semNome.erros.nome);
});

test('nomes repetidos na receita', () => {
  assert.deepEqual(nomesDuplicados([linha({ nome: 'Açúcar' }), linha({ nome: ' acucar ' }), linha({ nome: 'Ovos' }), linha({})]), ['acucar']);
  assert.deepEqual(nomesDuplicados([linha({ nome: 'A' }), linha({ nome: 'B' })]), []);
});

test('preço sugerido igual ao do formulário de produto', () => {
  // Sem Financeiro: markup com fixos = 0 e lucro 15%.
  const sem = calcPrecoSugeridoProduto(10, { despFixasPerc: 0, despVarPerc: 0, lucroDesejado: 0.15, markup: calcMarkup(0, 0, 0.15), margemSeguranca: 0 });
  perto(sem.preco, 10 / 0.85);
  assert.equal(sem.semFixos, true);
  // pricingConfig nulo cai no mesmo padrão (15%).
  perto(calcPrecoSugeridoProduto(10, null).preco, 10 / 0.85);
  // Com Financeiro: usa o markup do Financeiro e a margem de segurança.
  const pc = { despFixasPerc: 0.2, despVarPerc: 0.1, lucroDesejado: 0.2, markup: calcMarkup(0.2, 0.1, 0.2), margemSeguranca: 0.1 };
  const com = calcPrecoSugeridoProduto(10, pc);
  perto(com.preco, 10 * 1.1 * 2);
  assert.equal(com.semFixos, false);
  assert.equal(com.temFinanceiro, true);
  // Markup do Financeiro inviável (gastos + lucro >= 100%): o formulário cai
  // no markup sem custos fixos (variáveis + lucro). Mesma regra aqui.
  const inviavel = { despFixasPerc: 0.5, despVarPerc: 0.3, lucroDesejado: 0.2, markup: 0, margemSeguranca: 0 };
  perto(calcPrecoSugeridoProduto(10, inviavel).preco, 10 / (1 - 0.5));
  // Variáveis + lucro também inviáveis → 0.
  assert.equal(calcPrecoSugeridoProduto(10, { despFixasPerc: 0, despVarPerc: 0.9, lucroDesejado: 0.2, markup: 0, margemSeguranca: 0 }).preco, 0);
});

test('rendimento grava igual ao formulário e o divisor bate', () => {
  const un = camposRendimento('unidade', '20');
  assert.deepEqual(un, { unidade_rendimento: 'por_unidade', rendimento_total: 1, rendimento_unidades: 20 });
  assert.equal(getDivisorRendimento(un), 20);
  const kg = camposRendimento('kg', '1,5');
  assert.deepEqual(kg, { unidade_rendimento: 'por_kg', rendimento_total: 1.5, rendimento_unidades: 1 });
  assert.equal(getDivisorRendimento(kg), 1.5);
  const l = camposRendimento('litro', '2');
  assert.equal(l.unidade_rendimento, 'por_litro');
  assert.equal(camposRendimento('unidade', '0'), null);
  assert.equal(camposRendimento('unidade', ''), null);
});

const receita = [
  linha({ nome: 'Farinha', qtdCompra: '5', unCompra: 'kg', valor: '25', qtdUso: '300', unUso: 'g' }), // 1,50
  linha({ nome: 'Ovos', qtdCompra: '12', unCompra: 'un', valor: '18', qtdUso: '4', unUso: 'un' }), // 6,00
  linha({ nome: 'Leite', qtdCompra: '1', unCompra: 'L', valor: '6', qtdUso: '500', unUso: 'mL' }), // 3,00
  linhaVazia(),
];

test('resumo da receita: custo, custo por unidade e sugerido', () => {
  const r = resumoReceita(receita, { tipo: 'unidade', qtd: '20' }, null);
  perto(r.custoTotal, 10.5);
  perto(r.cmvUnitario, 10.5 / 20);
  perto(r.precoSugerido, (10.5 / 20) / 0.85);
  assert.equal(r.linhasValidas, 3);
  assert.deepEqual(r.bloqueios, []);
  const porKg = resumoReceita(receita, { tipo: 'kg', qtd: '1,5' }, null);
  perto(porKg.cmvUnitario, 7);
});

test('resumo bloqueia sem ingrediente válido, com linha incompleta, repetida ou sem rendimento', () => {
  assert.ok(resumoReceita([linhaVazia()], { tipo: 'unidade', qtd: '1' }, null).bloqueios.length > 0);
  assert.ok(resumoReceita([...receita, linha({ nome: 'Sal', qtdCompra: '1' })], { tipo: 'unidade', qtd: '1' }, null).bloqueios.length > 0);
  assert.ok(resumoReceita([...receita, linha({ nome: 'farinha', qtdCompra: '1', unCompra: 'kg', valor: '5', qtdUso: '10', unUso: 'g' })], { tipo: 'unidade', qtd: '1' }, null).bloqueios.length > 0);
  assert.ok(resumoReceita(receita, { tipo: 'unidade', qtd: '' }, null).bloqueios.length > 0);
});

test('payload: colunas do ingrediente e quantidade na unidade do ingrediente', () => {
  const p = montarPayloadPrimeiroProduto({ nome: ' Bolo de cenoura ', rendimento: { tipo: 'unidade', qtd: '20' }, linhas: receita }, null, '');
  assert.equal(p.produto.nome, 'Bolo de cenoura');
  assert.equal(p.produto.unidade_rendimento, 'por_unidade');
  assert.equal(p.produto.rendimento_unidades, 20);
  assert.equal(p.materias.length, 3);
  const farinha = p.materias[0];
  assert.equal(farinha.nome, 'Farinha');
  assert.equal(farinha.unidade_medida, 'kg');
  assert.equal(farinha.quantidade_bruta, 5);
  assert.equal(farinha.quantidade_liquida, 5);
  assert.equal(farinha.fator_correcao, 1);
  assert.equal(farinha.valor_pago, 25);
  perto(farinha.preco_por_kg, 5);
  perto(p.quantidades[0], 0.3);
  perto(p.quantidades[1], 4);
  perto(p.quantidades[2], 0.5);
  // Preço vazio → usa o sugerido arredondado.
  assert.equal(p.preco.origem, 'sugerido');
  assert.ok(p.preco.preco > 0);
  // Preço digitado vence.
  assert.equal(montarPayloadPrimeiroProduto({ nome: 'Bolo', rendimento: { tipo: 'unidade', qtd: '20' }, linhas: receita }, null, '2,50').preco.preco, 2.5);
});
