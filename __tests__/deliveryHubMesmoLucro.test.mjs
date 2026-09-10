/**
 * Testes — coluna "Mesmo lucro" adicionada ao modal "Meus preços nesta
 * plataforma" (src/screens/DeliveryHubScreen.js, fix walkthrough #7).
 *
 * O modal só tinha "Balcão" e "Quanto cobro"; a nova coluna reaproveita o
 * MESMO helper puro já usado pela Visão Geral (src/utils/deliveryPricing.js
 * → calcPrecoMesmoLucroReais) e a MESMA fórmula de "lucro líquido do balcão"
 * (ver SimuladorLoteScreen.js) — sem alterar nenhum cálculo, só exibindo o
 * dado que já existia em outro lugar.
 *
 * Nota: `calcResultadoDelivery` (motor de "resultado por plataforma") e
 * `calcPrecoMesmoLucroReais` (motor usado aqui) modelam a comissão em bases
 * diferentes (a primeira cobra comissão sobre preço+frete; a segunda trata
 * comissão como % simples do preço) — são dois motores propositalmente
 * distintos no código, não round-trippáveis entre si. Por isso este teste
 * verifica a integração feita em DeliveryHubScreen.js (lucroLiqBalcaoReais)
 * contra a função central `calcLucroLiquido` (mesma noção de "lucro líquido"
 * usada em todo o app) e contra o próprio motor `calcPrecoMesmoLucroReais`
 * isolando seus termos, em vez de misturar os dois motores de delivery.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calcLucroLiquido } from '../src/utils/calculations.js';
import { calcPrecoMesmoLucroReais } from '../src/utils/deliveryPricing.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `esperado ${b}, obtido ${a}`);

function mesmoLucroComoNoModal({ balcao, custoUnit, plat, contexto }) {
  // Mesma fórmula usada em DeliveryHubScreen.js (popup "Meus preços nesta
  // plataforma") e em SimuladorLoteScreen.js (Visão Geral).
  const lucroLiqBalcaoReais = Math.max(
    0,
    balcao - custoUnit - balcao * (contexto.fixoPerc + (contexto.variavelPerc || 0))
  );
  if (lucroLiqBalcaoReais <= 0) return null;
  const r = calcPrecoMesmoLucroReais({ cmv: custoUnit, lucroAlvoReais: lucroLiqBalcaoReais, plat, contexto });
  return (r && !r.inviavel && r.preco > 0) ? r.preco : null;
}

test('lucroLiqBalcaoReais do modal concorda com calcLucroLiquido (a mesma noção de "lucro líquido" usada no resto do app)', () => {
  const balcao = 25;
  const custoUnit = 5;
  const contexto = { fixoPerc: 0.10, variavelPerc: 0.05 };

  const despFixasValor = balcao * contexto.fixoPerc;
  const despVarValor = balcao * contexto.variavelPerc;
  const lucroLiquidoCanonico = calcLucroLiquido(balcao, custoUnit, despFixasValor, despVarValor);

  const lucroLiqBalcaoReais = Math.max(0, balcao - custoUnit - balcao * (contexto.fixoPerc + contexto.variavelPerc));

  close(lucroLiqBalcaoReais, lucroLiquidoCanonico);
  assert.equal(lucroLiqBalcaoReais, 16.25); // 25 - 5 - 25*0.15
});

test('coluna "Mesmo lucro": entrega EXATAMENTE o lucroAlvoReais pedido — calcPrecoMesmoLucroReais garante isso por construção (r.lucroReais)', () => {
  const balcao = 25;
  const custoUnit = 5;
  const contexto = { fixoPerc: 0.10, variavelPerc: 0.05, impostoPerc: 0.04 };
  const plat = { taxa_plataforma: 20, comissao_app: 0, taxa_entrega: 3, desconto_promocao: 0, embalagem_extra: 0 };

  const lucroLiqBalcaoReais = Math.max(0, balcao - custoUnit - balcao * (contexto.fixoPerc + contexto.variavelPerc));
  const r = calcPrecoMesmoLucroReais({ cmv: custoUnit, lucroAlvoReais: lucroLiqBalcaoReais, plat, contexto });

  assert.equal(r.inviavel, false);
  close(r.lucroReais, lucroLiqBalcaoReais);
  // Confirma a fórmula documentada: preco = (lucroAlvo + cmv + custosAbsolutos) / divisor
  const variavelPercMotor = contexto.impostoPerc + (plat.taxa_plataforma + plat.comissao_app) / 100;
  const divisor = 1 - contexto.fixoPerc - variavelPercMotor;
  const custosAbsolutos = plat.desconto_promocao + plat.embalagem_extra + plat.taxa_entrega;
  close(r.preco, (lucroLiqBalcaoReais + custoUnit + custosAbsolutos) / divisor);

  // Valor calculado à MÃO, num único modelo (o do Hub "Meus preços" / Visão Geral):
  //   lucro alvo = 25 − 5 − 25 × (0,10 + 0,05) = 16,25
  //   divisor    = 1 − 0,10 − (0,04 + 0,20)    = 0,66
  //   preço      = (16,25 + 5 + 3) / 0,66      = 24,25 / 0,66 = 36,74
  close(r.preco, 24.25 / 0.66);
  assert.equal(r.preco.toFixed(2), '36.74');
  // Round-trip no MESMO modelo (fixos + imposto + comissão sobre o preço; cupom/frete
  // como custo absoluto) — NÃO pelo calcResultadoDelivery (legado, sem fixos/imposto).
  const lucroRoundTrip = r.preco - custoUnit - custosAbsolutos - r.preco * (contexto.fixoPerc + variavelPercMotor);
  close(lucroRoundTrip, lucroLiqBalcaoReais);

  const precoMesmoLucro = mesmoLucroComoNoModal({ balcao, custoUnit, plat, contexto });
  close(precoMesmoLucro, r.preco);
  assert.ok(precoMesmoLucro > balcao, 'preço no delivery deve ser maior que o do balcão (cobre comissão/frete extra)');
});

test('coluna "Mesmo lucro": retorna null (exibida como "—") quando o balcão não tem lucro líquido pra igualar', () => {
  const balcao = 10;
  const custoUnit = 9; // margem baixa
  const contexto = { fixoPerc: 0.10, variavelPerc: 0.05 };
  const plat = { taxa_plataforma: 20, taxa_entrega: 3 };

  const precoMesmoLucro = mesmoLucroComoNoModal({ balcao, custoUnit, plat, contexto });
  assert.equal(precoMesmoLucro, null);
});

test('coluna "Mesmo lucro": inviável (custos ≥ 100%) também vira null, nunca um preço negativo/absurdo', () => {
  const balcao = 25;
  const custoUnit = 5;
  const contexto = { fixoPerc: 0.5, variavelPerc: 0.55 }; // 105% — inviável
  const plat = { taxa_plataforma: 10, taxa_entrega: 2 };

  const precoMesmoLucro = mesmoLucroComoNoModal({ balcao, custoUnit, plat, contexto });
  assert.equal(precoMesmoLucro, null);
});
