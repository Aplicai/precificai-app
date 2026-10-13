/**
 * aguardarAtivacao — espera o plano mudar depois que o checkout foi aberto.
 *
 * O checkout do Asaas abre em outra aba. Depois de pagar, o cliente fica numa
 * tela "Aguarde… estamos redirecionando" que é do Asaas e chegou a levar um
 * minuto (medido em 13/10/2026). O webhook, porém, grava o plano em segundos.
 * Em vez de depender do redirecionamento, a aba ORIGINAL do app fica
 * consultando o plano e avisa assim que ele muda.
 *
 * `consultar`, `esperar` e `agora` são injetados pra dar pra testar sem rede
 * nem relógio.
 */

export const INTERVALO_MS = 4000;
// Pix não é instantâneo do lado do cliente: ele precisa abrir o banco e pagar.
export const TEMPO_MAXIMO_MS = 15 * 60 * 1000;

/**
 * @returns {Promise<{ativou: boolean, plano: string|null, motivo: string}>}
 */
export async function aguardarAtivacao({
  planoAntes,
  consultar,
  esperar = (ms) => new Promise((r) => setTimeout(r, ms)),
  agora = () => Date.now(),
  intervaloMs = INTERVALO_MS,
  tempoMaximoMs = TEMPO_MAXIMO_MS,
  cancelado = () => false,
  // Na renovação o plano já é pago antes e depois; o que muda é a validade.
  // Quem chama pode consultar uma "marca" (plano + validade) e dizer aqui
  // quando ela representa um plano pago.
  estaAtivo = (valor) => !!valor && valor !== 'free',
}) {
  const inicio = agora();
  while (agora() - inicio < tempoMaximoMs) {
    await esperar(intervaloMs);
    if (cancelado()) return { ativou: false, plano: null, motivo: 'cancelado' };

    let plano = null;
    try {
      plano = await consultar();
    } catch {
      continue; // rede oscilou: tenta de novo no próximo ciclo
    }
    // Ativou = saiu do grátis E mudou em relação ao que era antes do checkout.
    if (estaAtivo(plano) && plano !== planoAntes) {
      return { ativou: true, plano, motivo: 'ativado' };
    }
  }
  return { ativou: false, plano: null, motivo: 'tempo_esgotado' };
}
