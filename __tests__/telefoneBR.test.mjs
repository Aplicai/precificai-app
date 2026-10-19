/**
 * Testes — src/utils/telefoneBR.js (WhatsApp na tela do primeiro preço, 19/10/2026).
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/telefoneBR.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { digitosTelefone, formatarTelefoneBR, telefoneBRValido, consentimentoWhatsApp } from '../src/utils/telefoneBR.js';

test('dígitos: tira +55, o 0 da operadora e o que não é número', () => {
  assert.equal(digitosTelefone('(11) 99999-1234'), '11999991234');
  assert.equal(digitosTelefone('+55 11 99999-1234'), '11999991234');
  assert.equal(digitosTelefone('55 11 3333-1234'), '1133331234');
  assert.equal(digitosTelefone('011 99999-1234'), '11999991234');
  assert.equal(digitosTelefone('011 3333-1234'), '1133331234');
  assert.equal(digitosTelefone('55 99999-1234'), '55999991234'); // DDD 55 (RS) fica
  assert.equal(digitosTelefone(''), '');
  assert.equal(digitosTelefone(null), '');
  assert.equal(digitosTelefone('119999912345678'), '11999991234');
});

test('máscara enquanto digita', () => {
  assert.equal(formatarTelefoneBR(''), '');
  assert.equal(formatarTelefoneBR('1'), '(1');
  assert.equal(formatarTelefoneBR('11'), '(11');
  assert.equal(formatarTelefoneBR('119'), '(11) 9');
  assert.equal(formatarTelefoneBR('119999'), '(11) 9999');
  assert.equal(formatarTelefoneBR('1199999'), '(11) 9999-9');
  assert.equal(formatarTelefoneBR('1133331234'), '(11) 3333-1234');
  assert.equal(formatarTelefoneBR('11999991234'), '(11) 99999-1234');
  assert.equal(formatarTelefoneBR('+55 (11) 99999-1234'), '(11) 99999-1234');
  // Apagar o hífen não trava a máscara
  assert.equal(formatarTelefoneBR('(11) 9999-'), '(11) 9999');
  // Idempotente
  assert.equal(formatarTelefoneBR(formatarTelefoneBR('11999991234')), '(11) 99999-1234');
});

test('validação: celular com 9, fixo com 8 dígitos, DDD sem zero', () => {
  assert.equal(telefoneBRValido('(11) 99999-1234'), true);
  assert.equal(telefoneBRValido('+55 21 98888-7777'), true);
  assert.equal(telefoneBRValido('(11) 3333-1234'), true);
  assert.equal(telefoneBRValido('(11) 89999-1234'), false); // 11 dígitos sem 9
  assert.equal(telefoneBRValido('(01) 99999-1234'), false);
  assert.equal(telefoneBRValido('(10) 99999-1234'), false);
  assert.equal(telefoneBRValido('(11) 9999-123'), false);
  assert.equal(telefoneBRValido('(11) 0333-1234'), false);
  assert.equal(telefoneBRValido('(11) 9333-1234'), false); // fixo não começa com 9
  assert.equal(telefoneBRValido(''), false);
  assert.equal(telefoneBRValido(null), false);
});

test('aceite do WhatsApp: telefone formatado, true e a hora', () => {
  const agora = new Date('2026-10-19T15:00:00.000Z');
  assert.deepEqual(consentimentoWhatsApp('11999991234', agora), {
    ok: true,
    campos: { telefone: '(11) 99999-1234', whatsapp_lembretes: true, whatsapp_lembretes_em: '2026-10-19T15:00:00.000Z' },
  });
});

test('aceite do WhatsApp: sem número ou número errado não grava', () => {
  const vazio = consentimentoWhatsApp('');
  assert.equal(vazio.ok, false);
  assert.match(vazio.erro, /DDD/);
  const errado = consentimentoWhatsApp('(11) 1234');
  assert.equal(errado.ok, false);
  assert.ok(errado.erro.length > 0);
  assert.equal(errado.campos, undefined);
});
