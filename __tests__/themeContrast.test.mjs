/** Audit a11y — tokens de texto secundário precisam passar WCAG AA (4.5:1). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { colors } from '../src/utils/theme.js';

function lum(hex) {
  const c = hex.replace('#', '');
  const ch = [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrast(a, b) {
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

test('text / textSecondary / placeholder ≥ 4.5:1 sobre background e surface', () => {
  for (const fg of ['text', 'textSecondary', 'placeholder']) {
    for (const bg of ['background', 'surface']) {
      const r = contrast(colors[fg], colors[bg]);
      assert.ok(r >= 4.5, `${fg} (${colors[fg]}) sobre ${bg} (${colors[bg]}) = ${r.toFixed(2)}:1 < 4.5`);
    }
  }
});
