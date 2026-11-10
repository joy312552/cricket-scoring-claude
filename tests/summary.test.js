import { test } from 'node:test'; import assert from 'node:assert/strict';
import { drawSummary } from '../public/js/summary-image.js'; import { sampleVM } from '../public/js/demo.js';
test('summary image draws with a stub canvas (no exceptions, brand text present)', () => {
  const calls = []; const grad = { addColorStop() {} };
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? (s) => ({ width: String(s).length * 14 }) : (k === 'createRadialGradient' || k === 'createLinearGradient') ? () => grad : (...a) => { calls.push([k, a]); }), set: () => true });
  drawSummary(ctx, sampleVM(), { host: 'example.vercel.app', imgs: {} });
  const texts = calls.filter(c => c[0] === 'fillText').map(c => c[1][0]);
  assert.ok(texts.includes('CREASE') && texts.includes('SCORED LIVE ON CREASE') && texts.includes('example.vercel.app'));
  assert.ok(texts.some(t => /WON BY/.test(t)) && texts.includes('PLAYER OF THE MATCH'));
});
