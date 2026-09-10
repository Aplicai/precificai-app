/**
 * AUDIT (Agente 3 — validação de cálculos) — engine de precificação, delivery,
 * adapter, BCG, cascade e config financeira.
 *
 * Testes `{ todo: 'AUDIT BUG: …' }` afirmam o valor CORRETO e falham hoje —
 * ver relatório a3-calc.md.
 *
 * Rodar: node --test '__tests__/audit-*.test.mjs'
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';

register('./audit-loader.mjs', import.meta.url);

const precif = await import('../src/utils/precificacao.js');
const dp = await import('../src/utils/deliveryPricing.js');
const da = await import('../src/utils/deliveryAdapter.js');
const bcg = await import('../src/utils/bcgClassify.js');
const fin = await import('../src/config/financeiro.js');
const cascade = await import('../src/services/cascadeRecalc.js');
const calc = await import('../src/utils/calculations.js');

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ─────────────────────────────────────────────────────────────────────
// 1. precificacao.js — engine balcão / combo
// ─────────────────────────────────────────────────────────────────────
test('validarSomaPercentual — faixas ok/aviso/critico/inviavel', () => {
  assert.equal(precif.validarSomaPercentual(0.69).nivel, 'ok');
  assert.equal(precif.validarSomaPercentual(0.70).nivel, 'aviso');
  assert.equal(precif.validarSomaPercentual(0.85).nivel, 'critico');
  assert.equal(precif.validarSomaPercentual(0.999).ok, true);
  assert.equal(precif.validarSomaPercentual(1).ok, false);
  assert.equal(precif.validarSomaPercentual(1).nivel, 'inviavel');
  assert.equal(precif.validarSomaPercentual(NaN).nivel, 'ok'); // NaN → 0
});

test('calcularPrecoSugerido — custos absolutos entram no numerador; composição fecha o preço', () => {
  const r = precif.calcularPrecoSugerido({ cmv: 10, lucroPerc: 0.15, fixoPerc: 0.2, variavelPerc: 0.1, custosAbsolutos: 2 });
  assert.ok(close(r.preco, 12 / 0.55));                     // 21,8182
  const c = r.composicao;
  assert.ok(close(c.cmv + c.custosAbsolutos + c.lucroR + c.fixoR + c.variavelR, r.preco, 1e-9));
  assert.ok(close(c.cmvPercDoPreco, 10 / r.preco));
  // margem de segurança infla só o preço, composição mostra CMV real
  const rMS = precif.calcularPrecoSugerido({ cmv: 10, lucroPerc: 0.15, fixoPerc: 0.2, variavelPerc: 0.1, custosAbsolutos: 2, margemSegurancaPerc: 0.1 });
  assert.ok(close(rMS.preco, 13 / 0.55));
  assert.equal(rMS.composicao.cmv, 10);
  // inviável → preco 0, composicao null (sem Infinity)
  const inv = precif.calcularPrecoSugerido({ cmv: 10, lucroPerc: 0.5, fixoPerc: 0.3, variavelPerc: 0.2 });
  assert.equal(inv.preco, 0);
  assert.equal(inv.composicao, null);
});

test('calcularPrecoCombo — desconto R$ tem prioridade sobre %; composição refeita', () => {
  const base = { cmvCombo: 20, lucroPerc: 0.15, fixoPerc: 0.2, variavelPerc: 0.1 };
  const semDesc = precif.calcularPrecoCombo(base);
  assert.ok(close(semDesc.preco, 20 / 0.55));               // 36,3636
  const dR = precif.calcularPrecoCombo({ ...base, descontoR: 5 });
  assert.ok(close(dR.preco, 20 / 0.55 - 5));
  assert.ok(close(dR.precoSemDesconto, 20 / 0.55));
  const dP = precif.calcularPrecoCombo({ ...base, descontoPerc: 0.1 });
  assert.ok(close(dP.preco, (20 / 0.55) * 0.9));
  const ambos = precif.calcularPrecoCombo({ ...base, descontoR: 5, descontoPerc: 0.1 });
  assert.ok(close(ambos.preco, dR.preco));                  // R$ ganha
  // desconto 100% (dP = 1) é IGNORADO silenciosamente (condição dP < 1)
  const d100 = precif.calcularPrecoCombo({ ...base, descontoPerc: 1 });
  assert.ok(close(d100.preco, semDesc.preco));
  // composição com desconto: lucroR absorve o desconto
  const c = dR.composicao;
  assert.ok(close(c.lucroR, dR.preco - 20 - dR.preco * 0.3, 1e-9));
  assert.ok(close(c.cmv + c.lucroR + c.fixoR + c.variavelR, dR.preco, 1e-9));
  // desconto maior que o preço → 0 (não negativo)
  assert.equal(precif.calcularPrecoCombo({ ...base, descontoR: 999 }).preco, 0);
});

test('calcularLucroLiquido / calcularMargemContribuicao — R$10 CMV 4, var 10%, fixo 20%', () => {
  const ll = precif.calcularLucroLiquido({ preco: 10, cmv: 4, variavelPerc: 0.1, fixoPerc: 0.2 });
  assert.equal(ll.llR, 3);
  assert.equal(ll.llP, 0.3);
  const mc = precif.calcularMargemContribuicao({ preco: 10, cmv: 4, variavelPerc: 0.1 });
  assert.equal(mc.mcR, 5);
  assert.equal(mc.mcP, 0.5);
  assert.equal(precif.calcularLucroLiquido({ preco: 0, cmv: 4, variavelPerc: 0.1, fixoPerc: 0.2 }).llP, 0);
});

test('compararDeliveryVsBalcao — delivery < balcão crítico; igual aviso; maior ok', () => {
  assert.equal(precif.compararDeliveryVsBalcao(9, 10).nivel, 'critico');
  assert.equal(precif.compararDeliveryVsBalcao(10, 10).nivel, 'aviso');
  assert.equal(precif.compararDeliveryVsBalcao(10.005, 10).nivel, 'aviso'); // < 1 centavo
  assert.equal(precif.compararDeliveryVsBalcao(13, 10).nivel, 'ok');
  assert.match(precif.compararDeliveryVsBalcao(13, 10).mensagem, /30%/);
  assert.equal(precif.compararDeliveryVsBalcao(0, 10).nivel, 'ok');
});

test('pctToDecimal — heurística "n > 1 → /100" é ambígua: "1" = 100%, "1,5" = 1,5%, "0,5" = 50% (não usado por telas)', () => {
  assert.equal(precif.pctToDecimal('15'), 0.15);
  assert.equal(precif.pctToDecimal('15,5'), 0.155);
  assert.equal(precif.pctToDecimal(0.15), 0.15);
  assert.equal(precif.pctToDecimal('1'), 1);        // 100% !
  assert.equal(precif.pctToDecimal('1,5'), 0.015);  // 1,5%
  assert.equal(precif.pctToDecimal('0,5'), 0.5);    // 50% (usuária quis 0,5%)
});

// ─────────────────────────────────────────────────────────────────────
// 2. deliveryPricing.js — modelo LEGADO (calcResultadoDelivery / sugerirPrecoDelivery)
// ─────────────────────────────────────────────────────────────────────
// Semântica CANÔNICA pós-audit (tela Plataformas): taxa_plataforma = comissão %,
// comissao_app = taxa pgto online %, desconto_promocao = cupom R$ (não há desconto %).
const PLAT_LEGADO = { plataforma: 'iFood', taxa_plataforma: 27, desconto_promocao: 2, taxa_entrega: 5 };

test('calcResultadoDelivery — cenário à mão: preço 30, custo 10, comissão 27%, cupom R$2, frete 5', () => {
  const r = dp.calcResultadoDelivery({ precoVenda: 30, custoUnit: 10, plat: PLAT_LEGADO });
  assert.ok(close(r.valorDesconto, 0));
  assert.ok(close(r.precoComDesconto, 30));
  assert.ok(close(r.precoAposCupom, 28));
  assert.ok(close(r.baseComissao, 33));          // 28 + frete 5
  assert.ok(close(r.valorComissao, 8.91));
  assert.ok(close(r.receitaLiq, 14.09));         // 28 − 8,91 − 5
  assert.ok(close(r.lucro, 4.09));
  assert.ok(close(r.margem, 4.09 / 30));
  assert.equal(r.inviavel, false);
  // preço 0 → inviável sem NaN
  const z = dp.calcResultadoDelivery({ precoVenda: 0, custoUnit: 10, plat: PLAT_LEGADO });
  assert.equal(z.inviavel, true);
  assert.equal(z.margem, 0);
});

test('sugerirPrecoDelivery — inversão fecha com calcResultadoDelivery quando frete = 0', () => {
  const plat = { ...PLAT_LEGADO, taxa_entrega: 0 };
  const s = dp.sugerirPrecoDelivery({ custoUnit: 10, plat, margemAlvo: 0.3, arredondar: false });
  const r = dp.calcResultadoDelivery({ precoVenda: s.precoSugerido, custoUnit: 10, plat });
  assert.ok(close(r.margem, 0.3, 1e-9), `margem obtida ${r.margem}`);
  const rMin = dp.calcResultadoDelivery({ precoVenda: s.precoMinimo, custoUnit: 10, plat });
  assert.ok(close(rMin.lucro, 0, 1e-9));
  // arredondar → múltiplo de 0,50 para cima
  const sr = dp.sugerirPrecoDelivery({ custoUnit: 10, plat, margemAlvo: 0.3 });
  assert.equal(sr.precoSugerido % 0.5, 0);
  assert.ok(sr.precoSugerido >= s.precoSugerido);
});

test('sugerirPrecoDelivery — inversão fecha com calcResultadoDelivery TAMBÉM com frete > 0',
  () => {
    const s = dp.sugerirPrecoDelivery({ custoUnit: 10, plat: PLAT_LEGADO, margemAlvo: 0.3, arredondar: false });
    const r = dp.calcResultadoDelivery({ precoVenda: s.precoSugerido, custoUnit: 10, plat: PLAT_LEGADO });
    // Atual: lucro fica R$ 1,35 (= 5 × 27%) abaixo do alvo por pedido
    assert.ok(close(r.margem, 0.3, 1e-9), `margem obtida ${r.margem} (faltam R$ ${(0.3 * s.precoSugerido - r.lucro).toFixed(2)})`);
    const rMin = dp.calcResultadoDelivery({ precoVenda: s.precoMinimo, custoUnit: 10, plat: PLAT_LEGADO });
    assert.ok(close(rMin.lucro, 0, 1e-9), `precoMinimo dá prejuízo de R$ ${(-rMin.lucro).toFixed(2)}`);
  });

test('sugerirPrecoDelivery — inviável quando desconto+comissão+margem ≥ 100%; custo 0 inviável', () => {
  const s = dp.sugerirPrecoDelivery({ custoUnit: 10, plat: { taxa_plataforma: 70, desconto_promocao: 2 }, margemAlvo: 0.35 });
  assert.equal(s.inviavel, true);
  assert.equal(s.precoSugerido, null);
  assert.equal(dp.sugerirPrecoDelivery({ custoUnit: 0, plat: PLAT_LEGADO }).inviavel, true);
  assert.equal(dp.calcPrecoBreakEven(0, PLAT_LEGADO), null);
});

// ─────────────────────────────────────────────────────────────────────
// 3. deliveryPricing.js NOVO (calcSugestaoDeliveryCompleta) vs deliveryAdapter.js
//    — as DUAS leituras da mesma row `delivery_config` se contradizem
// ─────────────────────────────────────────────────────────────────────
// Row como o DeliveryPlataformasScreen grava (defaults iFood: taxa_plataforma 27 = comissão,
// comissao_app 3.2 = taxa pgto online, desconto_promocao = cupom R$).
const ROW_PLATAFORMAS = { plataforma: 'iFood', taxa_plataforma: 27, comissao_app: 3.2, desconto_promocao: 0, embalagem_extra: 0, taxa_entrega: 0, outros_perc: 0 };
const CTX = { lucroPerc: 0.15, fixoPerc: 0.2, impostoPerc: 0.06, variavelPerc: 0.1, margemSegurancaPerc: 0 };

test('calcSugestaoDeliveryCompleta (deliveryPricing) == calcularPrecoDeliveryPlataforma (deliveryAdapter) para a MESMA row',
  () => {
    const viaPricing = dp.calcSugestaoDeliveryCompleta({ cmv: 10, plat: ROW_PLATAFORMAS, contexto: CTX }).preco;
    const viaAdapter = da.calcularPrecoDeliveryPlataforma(10, ROW_PLATAFORMAS, CTX).preco;
    // Esperado (todas as taxas): 10 / (1 − 0,15 − 0,2 − 0,06 − 0,27 − 0,032) = 10 / 0,288 = 34,72
    assert.ok(close(viaAdapter, 10 / 0.288, 1e-9));
    assert.ok(close(viaPricing, viaAdapter, 1e-9), `pricing ${viaPricing.toFixed(2)} vs adapter ${viaAdapter.toFixed(2)}`);
  });

test('calcSugestaoDeliveryCompleta — comissao_app = 0 explícito ANULA taxa_plataforma (?? só cobre null)',
  () => {
    const row = { ...ROW_PLATAFORMAS, comissao_app: 0 };
    const r = dp.calcSugestaoDeliveryCompleta({ cmv: 10, plat: row, contexto: CTX });
    // esperado 10 / (1 − 0,15 − 0,2 − 0,06 − 0,27) = 31,25 ; atual 10 / 0,59 = 16,95
    assert.ok(close(r.preco, 31.25, 1e-9), `atual ${r.preco.toFixed(2)}`);
    const n = dp.normalizePlatform(row);
    assert.ok(close(n.comissaoPct, 0.27), `normalizePlatform.comissaoPct = ${n.comissaoPct}`);
  });

test('normalizePlatform (deliveryPricing) vs normalizePlataforma (deliveryAdapter) — semânticas opostas p/ desconto_promocao/embalagem_extra',
  () => {
    const row = { taxa_plataforma: 27, comissao_app: 0, desconto_promocao: 5, embalagem_extra: 0, taxa_entrega: 0 };
    const a = dp.normalizePlatform(row);
    const b = da.normalizePlataforma(row);
    assert.equal(a.cupomR$, b.cupomR, 'cupom R$ deveria vir da mesma coluna');
    assert.equal(a.comissaoPct, b.comissaoPct, 'comissão deveria vir da mesma coluna');
  });

test('calcSugestaoDeliveryCompleta — fluxo DeliveryHubScreen (pós-audit: mesmas colunas da tela Plataformas) fecha', () => {
  // Row como o DeliveryHubScreen grava agora: Comissão → taxa_plataforma, Cupom R$ → desconto_promocao.
  const row = { taxa_plataforma: 27, comissao_app: 0, desconto_promocao: 2, embalagem_extra: 0, taxa_entrega: 5, outros_perc: 1 };
  const r = dp.calcSugestaoDeliveryCompleta({ cmv: 10, plat: row, contexto: CTX });
  // (cmv + cupom + frete) / (1 − lucro − fixo − imposto − comissão − outros)
  const esperado = (10 + 2 + 5) / (1 - 0.15 - 0.2 - 0.06 - 0.27 - 0.01);
  assert.ok(close(r.preco, esperado, 1e-9));
  // lucro líquido no preço sugerido == 15% do preço (custos absolutos cobertos)
  const lucro = r.preco - 10 - 2 - 5 - r.preco * (0.2 + 0.06 + 0.27 + 0.01);
  assert.ok(close(lucro, r.preco * 0.15, 1e-9));
});

test('calcSugestaoDeliveryCompleta — linha LEGADA do Hub antigo (comissão em comissao_app, cupom em embalagem_extra) ainda fecha', () => {
  // Antes da migration de realinhamento, comissao_app pode carregar a comissão real; somamos os % e os R$.
  const row = { taxa_plataforma: 0, comissao_app: 27, desconto_promocao: 0, embalagem_extra: 2, taxa_entrega: 5, outros_perc: 1 };
  const r = dp.calcSugestaoDeliveryCompleta({ cmv: 10, plat: row, contexto: CTX });
  const esperado = (10 + 2 + 5) / (1 - 0.15 - 0.2 - 0.06 - 0.27 - 0.01);
  assert.ok(close(r.preco, esperado, 1e-9));
});

test('calcPrecoMesmoLucroReais — preço gerado rende EXATAMENTE o lucro alvo em R$', () => {
  const row = { taxa_plataforma: 0, comissao_app: 27, desconto_promocao: 0, embalagem_extra: 2, taxa_entrega: 5, outros_perc: 0 };
  const r = dp.calcPrecoMesmoLucroReais({ cmv: 10, lucroAlvoReais: 3, plat: row, contexto: CTX });
  const lucro = r.preco - 10 - 2 - 5 - r.preco * (0.2 + 0.06 + 0.27);
  assert.ok(close(lucro, 3, 1e-9));
  assert.equal(r.inviavel, false);
  // fixo + variáveis ≥ 100% → inviável
  const inv = dp.calcPrecoMesmoLucroReais({ cmv: 10, lucroAlvoReais: 3, plat: { comissao_app: 80 }, contexto: { fixoPerc: 0.2, impostoPerc: 0.06 } });
  assert.equal(inv.inviavel, true);
  assert.equal(inv.preco, 0);
});

// ─────────────────────────────────────────────────────────────────────
// 4. deliveryAdapter.js — contexto financeiro + extração de imposto
// ─────────────────────────────────────────────────────────────────────
test('buildContextoFinanceiro — fixo% = fixas / média(meses com valor > 0); lucro delivery com fallback', () => {
  const ctx = da.buildContextoFinanceiro({
    cfgRows: [{ lucro_desejado: 0.15, lucro_desejado_delivery: 0.2, margem_seguranca: 0.05 }],
    fixasRows: [{ valor: 3000 }, { valor: 2000 }],
    varsRows: [{ descricao: 'Imposto Simples', percentual: 0.06 }, { descricao: 'Taxa maquininha', percentual: 0.04 }],
    fatRows: [{ valor: 20000 }, { valor: 0 }, { valor: 30000 }],
    options: { usarLucroDelivery: true },
  });
  assert.equal(ctx.fixoPerc, 5000 / 25000);      // 0.2 — média só de meses > 0 (mesma regra das telas)
  assert.equal(ctx.lucroPerc, 0.2);
  assert.ok(close(ctx.impostoPerc, 0.06));
  assert.ok(close(ctx.variavelPerc, 0.10));
  assert.equal(ctx.margemSegurancaPerc, 0.05);
  // sem faturamento → fixo 0 (silencioso)
  assert.equal(da.buildContextoFinanceiro({ cfgRows: [], fixasRows: [{ valor: 3000 }], varsRows: [], fatRows: [] }).fixoPerc, 0);
  // sem config → 0.15 ; config com lucro_desejado = 0 → 0 (ProdutoFormScreen:402 usaria 0.15 → divergência)
  assert.equal(da.buildContextoFinanceiro({ cfgRows: [], fixasRows: [], varsRows: [], fatRows: [] }).lucroPerc, 0.15);
  assert.equal(da.buildContextoFinanceiro({ cfgRows: [{ lucro_desejado: 0 }], fixasRows: [], varsRows: [], fatRows: [] }).lucroPerc, 0);
});

test('extrairImpostoPercentual — reconhece Imposto/ICMS/ISS/Simples/MEI e exclui maquininha', () => {
  const rows = [
    { descricao: 'Impostos (Simples)', percentual: 0.06 },
    { descricao: 'Taxa maquininha', percentual: 0.04 },
    { descricao: 'ISS', percentual: 0.02 },
    { descricao: 'Perdas', percentual: 0.01 },
  ];
  assert.ok(close(da.extrairImpostoPercentual(rows), 0.08));
  assert.equal(da.extrairImpostoPercentual(null), 0);
});

test('extrairImpostoPercentual — "Comissão" NÃO é imposto',
  () => {
    assert.equal(da.extrairImpostoPercentual([{ descricao: 'Comissão garçom', percentual: 0.05 }]), 0);
    assert.equal(da.extrairImpostoPercentual([{ descricao: 'Taxa de meia-entrega', percentual: 0.03 }]), 0);
  });

// ─────────────────────────────────────────────────────────────────────
// 5. bcgClassify.js — empates, zero vendas, produto único
// ─────────────────────────────────────────────────────────────────────
test('classificarMatrizBCG — produto único / < 2 válidos → tudo Quebra-Cabeça', () => {
  const r = bcg.classificarMatrizBCG([{ precoVenda: 10, margemPerc: 50, qtdVendida: 100 }]);
  assert.equal(r[0].classificacao, 'Quebra-Cabeça');
  const r2 = bcg.classificarMatrizBCG([{ precoVenda: 10, margemPerc: 50, qtdVendida: 100 }, { precoVenda: 0, margemPerc: 0, qtdVendida: 5 }]);
  assert.ok(r2.every(p => p.classificacao === 'Quebra-Cabeça'));
  assert.deepEqual(bcg.classificarMatrizBCG([]), []);
  assert.deepEqual(bcg.classificarMatrizBCG(null), []);
});

test('classificarMatrizBCG — todos com 0 vendas → ninguém é Estrela/Cavalo', () => {
  const r = bcg.classificarMatrizBCG([
    { precoVenda: 10, margemPerc: 60, qtdVendida: 0 },
    { precoVenda: 10, margemPerc: 20, qtdVendida: 0 },
  ]);
  assert.equal(r[0].classificacao, 'Quebra-Cabeça');
  assert.equal(r[1].classificacao, 'Abacaxi');
});

test('classificarMatrizBCG — empates: margem >= mediana é alta; vendas > mediana ESTRITO (empate = baixa)', () => {
  // 2 produtos com vendas iguais: mediana = 10, nenhum > 10 → nenhum "alta venda"
  const r = bcg.classificarMatrizBCG([
    { precoVenda: 10, margemPerc: 60, qtdVendida: 10 },
    { precoVenda: 10, margemPerc: 20, qtdVendida: 10 },
  ]);
  assert.equal(r[0].classificacao, 'Quebra-Cabeça');
  assert.equal(r[1].classificacao, 'Abacaxi');
  // margens iguais: ambos "alta margem" (>=)
  const r2 = bcg.classificarMatrizBCG([
    { precoVenda: 10, margemPerc: 40, qtdVendida: 30 },
    { precoVenda: 10, margemPerc: 40, qtdVendida: 5 },
  ]);
  assert.equal(r2[0].classificacao, 'Estrela');
  assert.equal(r2[1].classificacao, 'Quebra-Cabeça');
  // mediana de vendas só considera itens COM venda (item sem venda não puxa a mediana pra baixo)
  const r3 = bcg.classificarMatrizBCG([
    { precoVenda: 10, margemPerc: 40, qtdVendida: 30 },
    { precoVenda: 10, margemPerc: 40, qtdVendida: 20 },
    { precoVenda: 10, margemPerc: 10, qtdVendida: 0 },
  ]);
  assert.equal(r3[0].classificacao, 'Estrela');        // 30 > mediana(30,20)=25
  assert.equal(r3[1].classificacao, 'Quebra-Cabeça');  // 20 < 25
  assert.equal(r3[2].classificacao, 'Abacaxi');
  assert.equal(bcg.median([3, 1, 2]), 2);
  assert.equal(bcg.median([4, 1, 3, 2]), 2.5);
  assert.equal(bcg.median([]), 0);
});

// ─────────────────────────────────────────────────────────────────────
// 6. config/financeiro.js
// ─────────────────────────────────────────────────────────────────────
test('classificarSaudeCustoFixo / getSugestaoMargemSeguranca', () => {
  assert.equal(fin.classificarSaudeCustoFixo(0.249), 'saudavel');
  assert.equal(fin.classificarSaudeCustoFixo(0.25), 'atencao');
  assert.equal(fin.classificarSaudeCustoFixo(0.35), 'critico');
  assert.equal(fin.classificarSaudeCustoFixo('abc'), 'saudavel'); // NaN → 0
  assert.equal(fin.getSugestaoMargemSeguranca('Confeitaria artesanal').label, '5-10%');
  assert.equal(fin.getSugestaoMargemSeguranca('Pizzaria do Zé').label, '8-12%');
  assert.equal(fin.getSugestaoMargemSeguranca('').label, '5-10%');
});

// ─────────────────────────────────────────────────────────────────────
// 7. cascadeRecalc.js — com DB fake (SQL casado por substring)
// ─────────────────────────────────────────────────────────────────────
function fakeDb(state) {
  const findId = (arr, id) => (arr || []).find(r => r.id === id) || null;
  return {
    updates: [],
    async getFirstAsync(sql, params = []) {
      if (sql.includes('FROM preparos WHERE id')) return findId(state.preparos, params[0]);
      if (sql.includes('FROM produtos WHERE id')) return findId(state.produtos, params[0]);
      if (sql.includes('FROM delivery_combos WHERE id')) return findId(state.combos, params[0]);
      if (sql.includes('FROM materias_primas WHERE id')) return findId(state.materias, params[0]);
      if (sql.includes('FROM embalagens WHERE id')) return findId(state.embalagens, params[0]);
      throw new Error('fakeDb.getFirstAsync: ' + sql);
    },
    async getAllAsync(sql, params = []) {
      if (sql.includes('FROM preparo_ingredientes pi JOIN materias_primas')) {
        return (state.preparoIngs || []).filter(r => r.preparo_id === params[0]).map(r => {
          const mp = findId(state.materias, r.materia_prima_id);
          return { quantidade_utilizada: r.quantidade_utilizada, preco_por_kg: mp.preco_por_kg, unidade_medida: mp.unidade_medida };
        });
      }
      if (sql.includes('FROM preparo_subpreparos ps JOIN preparos')) {
        return (state.subpreparos || []).filter(r => r.preparo_id === params[0]).map(r => {
          const pr = findId(state.preparos, r.sub_preparo_id);
          return { quantidade_utilizada: r.quantidade_utilizada, custo_por_kg: pr.custo_por_kg, unidade_medida: pr.unidade_medida };
        });
      }
      if (sql.includes('FROM produto_ingredientes pi JOIN')) return [];
      if (sql.includes('FROM produto_preparos pp JOIN')) return [];
      if (sql.includes('FROM produto_embalagens pe JOIN')) return [];
      if (sql.includes('FROM delivery_combo_itens')) return (state.comboItens || []).filter(r => r.combo_id === params[0]);
      if (sql.startsWith('SELECT id FROM preparos')) return (state.preparos || []).map(p => ({ id: p.id }));
      if (sql.includes('SELECT id, custo_por_kg FROM preparos')) return (state.preparos || []).map(p => ({ id: p.id, custo_por_kg: p.custo_por_kg }));
      throw new Error('fakeDb.getAllAsync: ' + sql);
    },
    async runAsync(sql, params = []) {
      this.updates.push({ sql, params });
      if (sql.startsWith('UPDATE preparos SET custo_por_kg')) {
        const p = findId(state.preparos, params[1]);
        if (p) p.custo_por_kg = params[0];
      }
      return { changes: 1 };
    },
  };
}

test('cascadeRecalc.recalcularPreparo — inclui sub-preparos; MateriaPrimaFormScreen:445-465 (cascade inline) NÃO inclui', async () => {
  // Recheio (sub-preparo) custa 20 R$/kg. Massa usa 500 g de farinha (R$ 6/kg) + 200 g de recheio. Rende 1000 g.
  const state = {
    materias: [{ id: 1, preco_por_kg: 6, unidade_medida: 'g' }],
    preparos: [
      { id: 10, rendimento_total: 1000, unidade_medida: 'g', custo_por_kg: 999 },
      { id: 20, rendimento_total: 1000, unidade_medida: 'g', custo_por_kg: 20 },
    ],
    preparoIngs: [{ preparo_id: 10, materia_prima_id: 1, quantidade_utilizada: 500 }],
    subpreparos: [{ preparo_id: 10, sub_preparo_id: 20, quantidade_utilizada: 200 }],
  };
  const db = fakeDb(state);
  const r = await cascade.recalcularPreparo(db, 10);
  assert.ok(close(r.custoTotal, 3 + 4));          // 500 g farinha = 3,00 + 200 g recheio = 4,00
  assert.ok(close(r.custoPorKg, 7));
  assert.equal(state.preparos[0].custo_por_kg, 7);
  // Cascade inline do MateriaPrimaFormScreen (só preparo_ingredientes): custoTotalPrep = 3 → custo_por_kg 3 (perde os R$ 4 do recheio)
  const inlineCustoTotal = state.preparoIngs.reduce((a, i) => a + calc.calcCustoIngrediente(6, i.quantidade_utilizada, 'g', 'g'), 0);
  const inlineCustoPorKg = (inlineCustoTotal / 1000) * 1000;
  assert.equal(inlineCustoPorKg, 3);
  assert.notEqual(inlineCustoPorKg, r.custoPorKg);
});

test('cascadeRecalc.recalcularTodosPreparos — converge em 2 níveis (preparo → sub-preparo → insumo)', async () => {
  const state = {
    materias: [{ id: 1, preco_por_kg: 10, unidade_medida: 'g' }],
    preparos: [
      { id: 10, rendimento_total: 1000, unidade_medida: 'g', custo_por_kg: 0 }, // usa 500 g do 20
      { id: 20, rendimento_total: 1000, unidade_medida: 'g', custo_por_kg: 0 }, // usa 1000 g do insumo 1 → 10 R$/kg
    ],
    preparoIngs: [{ preparo_id: 20, materia_prima_id: 1, quantidade_utilizada: 1000 }],
    subpreparos: [{ preparo_id: 10, sub_preparo_id: 20, quantidade_utilizada: 500 }],
  };
  const db = fakeDb(state);
  await cascade.recalcularTodosPreparos(db);
  assert.equal(state.preparos[1].custo_por_kg, 10);
  assert.equal(state.preparos[0].custo_por_kg, 5);   // 500 g × 10 R$/kg = 5 → /1000 g × 1000
});

test('cascadeRecalc.recalcularCombo — insumo/preparo em GRAMAS (unidade nativa g): quantidade × preço/kg ÷ 1000, igual às telas',
  async () => {
    // Auditoria 2026-09-09 [B2]: a semântica é a unidade NATIVA do item. Aqui insumo e
    // preparo são cadastrados em 'g', então 200 → 200 g e 100 → 100 g (valor inalterado).
    // Caso kg/L/un: __tests__/audit-fixes-2026-09-09.test.mjs.
    const state = {
      materias: [{ id: 1, preco_por_kg: 10, unidade_medida: 'g' }],
      preparos: [{ id: 20, rendimento_total: 1000, unidade_medida: 'g', custo_por_kg: 20 }],
      combos: [{ id: 5 }],
      comboItens: [
        { combo_id: 5, tipo: 'materia_prima', item_id: 1, quantidade: 200 }, // 200 g → R$ 2,00
        { combo_id: 5, tipo: 'preparo', item_id: 20, quantidade: 100 },      // 100 g → R$ 2,00
      ],
    };
    const r = await cascade.recalcularCombo(fakeDb(state), 5);
    const viaTela = calc.calcCustoIngrediente(10, 200, 'g', 'g') + calc.calcCustoPreparo(20, 100, 'g');
    assert.ok(close(viaTela, 4));
    assert.ok(close(r.custo, viaTela), `cascade ${r.custo} vs tela ${viaTela}`);
  });
