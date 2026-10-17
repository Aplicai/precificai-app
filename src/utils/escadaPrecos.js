/**
 * Escada dos 3 preços (17/10/2026, .specs/plans/escada-tres-precos.design.md).
 *
 * Depois do primeiro Preço rápido ninguém voltava (0 de 15). Agora a Home
 * simples segue até 3 produtos com preço, cada próximo preço leva ~15 s (os
 * números do mês já estão salvos) e o 3º libera a tabela de preços para
 * enviar no WhatsApp.
 *
 * Puro, sem React/RN (testado em __tests__/escadaPrecos.test.mjs).
 */
import { formatCurrency, formatNumberBR } from './calculations';
import { isErrorResult } from '../database/dbResult';

export const META_ESCADA = 3;
/** AsyncStorage: a pessoa tocou em "Ver painel completo" antes do 3º preço. */
export const CHAVE_PAINEL_ESCOLHIDO = 'painel_completo_escolhido';
export const LINK_APP = 'https://app.precificaiapp.com';

/**
 * @param {number|Array} produtosComPreco quantidade (ou lista) de produtos com preço
 * @returns {{ feitos: number, meta: number, completa: boolean }}
 */
export function etapaEscada(produtosComPreco) {
  const bruto = Array.isArray(produtosComPreco) ? produtosComPreco.length : Number(produtosComPreco);
  const n = Number.isFinite(bruto) && bruto > 0 ? Math.floor(bruto) : 0;
  return { feitos: Math.min(n, META_ESCADA), meta: META_ESCADA, completa: n >= META_ESCADA };
}

/**
 * Home simples (saudação + um próximo passo) em vez do painel completo:
 *   - nenhum produto com preço: sempre (como antes);
 *   - 1 ou 2: só se a pessoa não escolheu "Ver painel completo";
 *   - 3 ou mais: painel.
 * Com erro de carga ou carregando: nunca (não decide em cima de dado vazio).
 */
export function mostrarInicioSimples({ dadosOk, prodsComPreco, escolheuPainel }) {
  if (!dadosOk) return false;
  const n = Number(prodsComPreco) || 0;
  if (n <= 0) return true;
  return n < META_ESCADA && !escolheuPainel;
}

/** Escolheu o painel com 1 ou 2 produtos com preço: a escada vira um card no topo. */
export function mostrarEscadaNoPainel({ dadosOk, prodsComPreco, escolheuPainel }) {
  if (!dadosOk) return false;
  const n = Number(prodsComPreco) || 0;
  return !!escolheuPainel && n > 0 && n < META_ESCADA;
}

/**
 * Texto pronto para o WhatsApp. `produtos`: [{ nome, preco }] (só os com preço).
 */
export function textoTabelaPrecos(nomeNegocio, produtos) {
  const nome = String(nomeNegocio || '').trim();
  const linhas = (Array.isArray(produtos) ? produtos : [])
    .filter((p) => p && String(p.nome || '').trim() && Number(p.preco) > 0)
    .map((p) => `${String(p.nome).trim()}: ${formatCurrency(Number(p.preco))}`);
  const titulo = nome ? `*${nome}*\nTabela de preços` : '*Tabela de preços*';
  return `${titulo}\n\n${linhas.join('\n')}`;
}

/** Número → texto do campo ("2.000", "8.500,50"), lido de volta por parseValorBR. */
export function valorParaCampo(n) {
  if (n === null || n === undefined || n === '') return '';
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  const centavos = Math.round(v * 100) % 100 !== 0;
  return formatNumberBR(v, centavos ? 2 : 0);
}

/**
 * Gastos e vendas do mês já salvos, para o Preço rápido do próximo produto.
 *   gastoMes = soma de `despesas_fixas`;
 *   vendaMes = média de `faturamento_mensal` com valor > 0.
 * Leitura com erro: aquele número fica null (a tela volta a perguntar; nunca
 * calcula com zero por engano). Sem nenhuma despesa fixa também é null: zero
 * só vale quando a pessoa digita.
 * @returns {{ gastoMes: number|null, vendaMes: number|null, completo: boolean }}
 */
export function numerosDoMes(fixas, faturamento) {
  let gastoMes = null;
  if (!isErrorResult(fixas) && Array.isArray(fixas) && fixas.length > 0) {
    gastoMes = fixas.reduce((a, f) => a + (Number(f?.valor) || 0), 0);
  }
  let vendaMes = null;
  if (!isErrorResult(faturamento) && Array.isArray(faturamento)) {
    const meses = faturamento.filter((f) => Number(f?.valor) > 0);
    if (meses.length > 0) vendaMes = meses.reduce((a, f) => a + Number(f.valor), 0) / meses.length;
  }
  return { gastoMes, vendaMes, completo: gastoMes !== null && vendaMes !== null };
}
