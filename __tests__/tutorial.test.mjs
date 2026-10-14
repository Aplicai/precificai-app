import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { CAPITULOS, ORDEM_CAPITULOS, urlEmbed, urlYoutube, formatarTempo, TUTORIAL_VIDEO_ID } from '../src/config/tutorial.js';

test('capítulos em ordem crescente e dentro dos 4:48 do vídeo', () => {
  const ts = ORDEM_CAPITULOS.map((k) => CAPITULOS[k].t);
  assert.deepEqual(ts, [...ts].sort((a, b) => a - b));
  assert.ok(ts.every((t) => t >= 0 && t < 288));
  assert.equal(ORDEM_CAPITULOS.length, Object.keys(CAPITULOS).length);
});

test('urlEmbed — nocookie, autoplay e start só quando > 0', () => {
  assert.equal(urlEmbed('abertura'), `https://www.youtube-nocookie.com/embed/${TUTORIAL_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1&playsinline=1`);
  assert.ok(urlEmbed('financeiro').endsWith('&start=93'));
  assert.ok(urlEmbed(42.9).endsWith('&start=42'));
  assert.ok(!urlEmbed('inexistente').includes('start='));
});

test('urlYoutube e formatarTempo', () => {
  assert.equal(urlYoutube('produto'), `https://youtu.be/${TUTORIAL_VIDEO_ID}?t=211`);
  assert.equal(urlYoutube(), `https://youtu.be/${TUTORIAL_VIDEO_ID}`);
  assert.equal(formatarTempo(93), '1:33');
  assert.equal(formatarTempo(265), '4:25');
  assert.equal(formatarTempo(-3), '0:00');
});
