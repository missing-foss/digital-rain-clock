// SPDX-License-Identifier: Apache-2.0
// The rain and the time it forms: the font, the stencil, the lighting rule
// on a seeded rain, the frame-rate rule and the katakana check.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../assets/clock/rain.js');

// A small seeded generator (mulberry32), so a run is exactly repeatable.
function seeded(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('the 5×7 digits: a slashed 0, the closed diagonal 4, a hooked 9', () => {
  for (const d of '0123456789') {
    assert.strictEqual(R.FONT[d].length, 7, d);
    for (const row of R.FONT[d]) assert.match(row, /^[01]{5}$/, d);
  }
  assert.deepStrictEqual(R.FONT['0'].slice(2, 5), ['10011', '10101', '11001'], 'the slash');
  assert.deepStrictEqual(R.FONT['4'], ['00010', '00110', '01010', '10010', '11111', '00010', '00010']);
  assert.deepStrictEqual(R.FONT['9'].slice(4), ['00001', '00010', '01100'], 'the hook');
  assert.strictEqual(R.KANA.length, 0xFF9D - 0xFF66 + 1);
  assert.strictEqual(R.KANA[0], 'ｦ');
});

test('the time as text: 24-hour, or 12-hour without a leading zero or AM/PM', () => {
  const at = (h, m) => new Date(2026, 9, 24, h, m);
  assert.strictEqual(R.timeText(at(7, 5), false), '07:05');
  assert.strictEqual(R.timeText(at(0, 0), false), '00:00');
  assert.strictEqual(R.timeText(at(7, 5), true), '7:05');
  assert.strictEqual(R.timeText(at(0, 0), true), '12:00');
  assert.strictEqual(R.timeText(at(12, 30), true), '12:30');
  assert.strictEqual(R.timeText(at(23, 59), true), '11:59');
});

const bounds = (mask, cols, rows) => {
  let x0 = cols, x1 = -1, y0 = rows, y1 = -1;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (mask[y * cols + x]) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0, x1, y0, y1 };
};

test('the stencil fits, is centred, and keeps the digits at most 1.5 times taller than wide', () => {
  for (const [text, cols, rows] of [['14:49', 64, 40], ['00:00', 64, 40], ['7:05', 64, 40], ['14:49', 40, 64]]) {
    const mask = R.stencil(text, cols, rows, 0, 0);
    const b = bounds(mask, cols, rows);
    assert.ok(b.x1 >= 0, `${text}: something lit`);
    assert.ok(b.x1 - b.x0 + 1 <= Math.ceil(cols * 0.9) && b.y1 - b.y0 + 1 <= Math.ceil(rows * 0.62), `${text} ${cols}×${rows}: inside`);
    assert.ok(Math.abs((b.x0 + b.x1) / 2 - (cols - 1) / 2) <= 1.5, `${text}: centred across`);
    assert.ok(Math.abs((b.y0 + b.y1) / 2 - (rows - 1) / 2) <= 1.5, `${text}: centred down`);
    // A digit is 5 font pixels wide and 7 high; its cells keep a 7/5 × (≤ 1.5) shape.
    const width = (b.x1 - b.x0 + 1) / (text.length * 6 - 1 - (text.includes(':') ? 4 : 0));
    assert.ok((b.y1 - b.y0 + 1) / 7 <= width * 1.5 + 1, `${text}: at most 1.5 times taller than wide`);
  }
  assert.notDeepStrictEqual(R.stencil('14:49', 64, 40, 0, 0), R.stencil('14:50', 64, 40, 0, 0), 'the minute changes it');
});

test('on a wide screen the height is the limit: 0.62 of it, and the digits do not widen to fill the rest', () => {
  for (const [text, units] of [['14:49', 25], ['7:05', 19]]) {
    const cols = 200, rows = 40;
    const b = bounds(R.stencil(text, cols, rows, 0, 0), cols, rows);
    const width = b.x1 - b.x0 + 1, height = b.y1 - b.y0 + 1;
    assert.ok(height <= Math.ceil(rows * 0.62), `${text}: ${height} rows, inside 0.62 of ${rows}`);
    assert.ok(height >= Math.floor(rows * 0.62) - 1, `${text}: ${height} rows, the height decides`);
    // A font pixel is height / 7 rows tall; across, it is no wider than that.
    assert.ok(width / (height * units / 7) <= 1.15, `${text}: ${width} columns wide, font pixels no wider than tall`);
  }
});

test('the drift moves the stencil by one cell at most, each minute', () => {
  const at = (m) => new Date(2026, 9, 24, 14, m);
  const seen = new Set();
  for (let m = 0; m < 60; m++) {
    const [dx, dy] = R.drift(at(m));
    assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1, `minute ${m}`);
    seen.add(`${dx},${dy}`);
  }
  assert.ok(seen.size > 1, 'it moves');
  const still = bounds(R.stencil('14:49', 64, 40, 0, 0), 64, 40);
  const moved = bounds(R.stencil('14:49', 64, 40, 1, 1), 64, 40);
  assert.deepStrictEqual([moved.x0 - still.x0, moved.y0 - still.y0], [1, 1]);
});

test('a stencil cell lights only when a stream reaches it, then stays lit; outside the stencil it fades', () => {
  const cols = 64, rows = 40, rng = seeded(7);
  const state = R.create(cols, rows, R.pool(true), rng);
  const mask = R.stencil('14:49', cols, rows, 0, 0);
  const everReached = new Array(cols * rows).fill(false);
  for (let f = 0; f < 30 * 20; f++) {   // 20 s at 30 fps
    for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) {
      const i = y * cols + x;
      const before = state.lit[i];
      const reached = (() => { const d = state.drops[x]; return d.y + d.v / 30 - y >= 0 && d.y - d.len <= y + 1; })();
      everReached[i] = everReached[i] || reached;
      if (before === 0 && !everReached[i]) assert.ok(true);
    }
    R.step(state, 1 / 30, 1, mask, rng);
    for (let i = 0; i < cols * rows; i++) {
      if (state.lit[i] > 0 && mask[i]) assert.ok(everReached[i], `cell ${i} lit before a stream reached it`);
    }
  }
  const lit = mask.map((m, i) => (m ? state.lit[i] : null)).filter((v) => v !== null);
  assert.ok(lit.filter((v) => v === 1).length / lit.length > 0.95, 'after 20 s nearly every stencil cell is fully lit');
  // The minute changes: the old digits fade to nothing within 1/0.7 s, plus a frame.
  const next = R.stencil('14:50', cols, rows, 0, 0);
  for (let f = 0; f < Math.ceil(30 / 0.7) + 1; f++) R.step(state, 1 / 30, 1, next, rng);
  for (let i = 0; i < cols * rows; i++) if (!next[i]) assert.strictEqual(state.lit[i], 0, `cell ${i} still lit`);
});

test('glyphs in the time change about 12 times more slowly than the rain', () => {
  const cols = 40, rows = 30, rng = seeded(11);
  const state = R.create(cols, rows, R.pool(true), rng);
  const mask = Array.from({ length: cols * rows }, (_, i) => (i % cols) % 2 === 0);   // every other column
  const changes = [0, 0];   // [rain, time]
  for (let f = 0; f < 30 * 120; f++) {   // 2 minutes at 30 fps
    const before = state.glyph.slice();
    R.step(state, 1 / 30, 1, mask, rng);
    for (let i = 0; i < cols * rows; i++) {
      if (state.glyph[i] !== before[i]) changes[mask[i] ? 1 : 0]++;
    }
  }
  const ratio = changes[0] / changes[1];
  assert.ok(ratio > 8 && ratio < 16, `rain changes ${ratio.toFixed(1)} times as often as the time`);
});

test('rain only: nothing lights', () => {
  const rng = seeded(3), state = R.create(32, 20, R.pool(false), rng);
  for (let f = 0; f < 300; f++) R.step(state, 1 / 30, 1, null, rng);
  assert.ok(state.lit.every((v) => v === 0));
  assert.ok(state.glyph.every((g) => R.DIGITS.includes(g)), 'digits only from the digits pool');
});

test('the frame rate steps down when frames run over budget, and climbs back when they are cheap', () => {
  const frames = (ms, n = 30) => new Array(n).fill(ms);
  assert.strictEqual(R.adaptRate(30, frames(5)), 30, 'cheap at 30: stays');
  assert.strictEqual(R.adaptRate(30, frames(30)), 20, 'over 80 % of 33 ms: down to 20');
  assert.strictEqual(R.adaptRate(20, frames(45)), 15, 'over 80 % of 50 ms: down to 15');
  assert.strictEqual(R.adaptRate(15, frames(80)), 15, 'never below 15');
  assert.strictEqual(R.adaptRate(15, frames(10)), 20, 'under 40 % of 50 ms: back up to 20');
  assert.strictEqual(R.adaptRate(20, frames(10)), 30, 'under 40 % of 33 ms: back up to 30');
  assert.strictEqual(R.adaptRate(20, frames(20)), 20, 'in between: stays');
  // Climbing back is judged against the faster rate's budget, not the current one's.
  assert.strictEqual(R.adaptRate(15, frames(22)), 15, 'under 40 % of 67 ms but not of 50 ms: stays at 15');
  assert.strictEqual(R.adaptRate(20, frames(15)), 20, 'under 40 % of 50 ms but not of 33 ms: stays at 20');
  assert.strictEqual(R.adaptRate(30, frames(80, 5)), 30, 'too few frames to judge: stays');
  assert.strictEqual(R.adaptRate(30, [...frames(5, 20), ...frames(90, 9)]), 30, 'the median, so a few slow frames do not count');
});

test('katakana are used only if every one of them draws', () => {
  const box = 'BOX', blank = '';
  const drawsAll = (ch) => (ch === R.MISSING ? box : ch === ' ' ? blank : `glyph-${ch}`);
  assert.strictEqual(R.kanaDraws(drawsAll), true);
  const lacksOne = (ch) => (ch === R.MISSING || ch === 'ｱ' ? box : ch === ' ' ? blank : `glyph-${ch}`);
  assert.strictEqual(R.kanaDraws(lacksOne), false, 'one drawn as the missing-glyph box');
  const blankOne = (ch) => (ch === R.MISSING ? box : ch === ' ' || ch === 'ﾝ' ? blank : `glyph-${ch}`);
  assert.strictEqual(R.kanaDraws(blankOne), false, 'one drawn as nothing');
});
