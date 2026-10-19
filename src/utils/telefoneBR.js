/**
 * Telefone/WhatsApp brasileiro (19/10/2026): máscara, validação e o pedido de
 * lembretes no WhatsApp da tela do primeiro preço (PrimeiroPrecoScreen).
 *
 * LGPD: o aceite é explícito (botão "Quero receber"); grava o telefone em
 * `perfil.telefone` e `perfil.whatsapp_lembretes = true`. A hora do aceite
 * (`whatsapp_lembretes_em`) é carimbada pelo banco (trigger da migration
 * 20261019120000); o valor mandado daqui é só o do aparelho.
 *
 * Puro, sem React/RN (testado em __tests__/telefoneBR.test.mjs).
 */

/** Só os dígitos do DDD + número: tira +55 e o 0 da operadora. */
export function digitosTelefone(valor) {
  let d = String(valor ?? '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if ((d.length === 11 || d.length === 12) && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 11);
}

/**
 * Máscara enquanto digita: "(11) 99999-1234" (celular) ou "(11) 3333-1234" (fixo).
 * Aceita o que vier colado ("+55 11 99999 1234").
 */
export function formatarTelefoneBR(valor) {
  const d = digitosTelefone(valor);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const meio = d.length === 11 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, meio)}-${resto.slice(meio)}`;
}

/**
 * DDD válido (11 a 99, sem 0) e 8 dígitos (fixo) ou 9 começando por 9 (celular).
 * WhatsApp Business também roda em número fixo.
 */
export function telefoneBRValido(valor) {
  const d = digitosTelefone(valor);
  if (d.length !== 10 && d.length !== 11) return false;
  if (!/^[1-9][1-9]$/.test(d.slice(0, 2))) return false;
  if (d.length === 11) return d[2] === '9';
  return /^[2-8]/.test(d.slice(2));
}

/**
 * O que gravar em `perfil` quando a pessoa toca em "Quero receber".
 * @returns {{ ok: true, campos: { telefone: string, whatsapp_lembretes: boolean, whatsapp_lembretes_em: string } }
 *          | { ok: false, erro: string }}
 */
export function consentimentoWhatsApp(telefone, agora = new Date()) {
  if (!digitosTelefone(telefone)) return { ok: false, erro: 'Digite seu WhatsApp com DDD.' };
  if (!telefoneBRValido(telefone)) return { ok: false, erro: 'Confira o número: DDD e mais 8 ou 9 dígitos.' };
  return {
    ok: true,
    campos: {
      telefone: formatarTelefoneBR(telefone),
      whatsapp_lembretes: true,
      whatsapp_lembretes_em: new Date(agora).toISOString(),
    },
  };
}
