/**
 * Testes — src/utils/aberturas.js (registro de aberturas, 18/10/2026).
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/aberturas.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { modoAbertura, ehNovaVisita, INTERVALO_NOVA_VISITA_MS } from '../src/utils/aberturas.js';

const IG_ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-A135M; wv) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36 Instagram 349.0';
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0 Safari/537.36';

test('identifica app instalado, plataforma e navegador do Instagram', () => {
  assert.deepEqual(modoAbertura({ standalone: true, ua: SAFARI }), { instalado: true, plataforma: 'ios', navegador_interno: false });
  assert.deepEqual(modoAbertura({ standalone: false, ua: IG_ANDROID }), { instalado: false, plataforma: 'android', navegador_interno: true });
  assert.deepEqual(modoAbertura({ standalone: false, ua: MAC }), { instalado: false, plataforma: 'desktop', navegador_interno: false });
});

test('nova visita: primeira vez ou depois de 30 minutos parado', () => {
  const agora = 1_800_000_000_000;
  assert.equal(ehNovaVisita(null, agora), true);
  assert.equal(ehNovaVisita(String(agora - 60_000), agora), false);
  assert.equal(ehNovaVisita(String(agora - INTERVALO_NOVA_VISITA_MS), agora), true);
});
