// SPDX-License-Identifier: Apache-2.0
// The rain and the time it forms, without a DOM: tested in Node. The page
// (clock.js) draws what this computes. Randomness is passed in, so a test
// can run the rain exactly.
(function (root) {
  'use strict';

  // HH:MM in a blocky 5×7 pixel font of our own. A pixel font, not a
  // typeface: at 30-40 rows high a typeface's curves turn to mush (4 and 9
  // especially), while 5×7 digits read at any size. The 0 has a slash, the
  // 4 is the closed diagonal one, the 9 has a hooked tail.
  var FONT = {
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    ':': ['0', '0', '1', '0', '1', '0', '0']
  };

  // The glyphs: half-width katakana U+FF66 to U+FF9D, and digits.
  var KANA = [];
  for (var c = 0xFF66; c <= 0xFF9D; c++) KANA.push(String.fromCharCode(c));
  var DIGITS = '0123456789'.split('');

  // The pool to draw from: katakana with the digits twice, or digits only.
  function pool(kana) { return kana ? KANA.concat(DIGITS, DIGITS) : DIGITS.slice(); }

  // The time as the stencil shows it: 24-hour "07:05", or 12-hour "7:05"
  // (no AM/PM: the font has no letters).
  function timeText(date, twelve) {
    var h = date.getHours(), m = date.getMinutes();
    var mm = (m < 10 ? '0' : '') + m;
    if (twelve) return (h % 12 === 0 ? 12 : h % 12) + ':' + mm;
    return (h < 10 ? '0' : '') + h + ':' + mm;
  }

  // Which cells of a cols×rows grid lie inside the text, as one flag per
  // cell, row by row. At most 0.9 of the width and 0.62 of the height, the
  // digits up to 1.5 times taller than wide, centred, then moved by
  // (dx, dy) cells for the slow drift.
  function stencil(text, cols, rows, dx, dy) {
    var chars = text.split('');
    var units = 0;
    chars.forEach(function (ch, k) { units += FONT[ch][0].length + (k ? 1 : 0); });
    var sx = Math.min(cols * 0.9 / units, rows * 0.62 / 7);
    var sy = Math.min(rows * 0.62 / 7, sx * 1.5);
    var x0 = (cols - units * sx) / 2 + (dx || 0), y0 = (rows - 7 * sy) / 2 + (dy || 0);
    var mask = new Array(cols * rows);
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var on = false;
        var fy = Math.floor((y + 0.5 - y0) / sy);
        var fx = Math.floor((x + 0.5 - x0) / sx);
        if (fy >= 0 && fy < 7 && fx >= 0) {
          for (var k = 0, at = 0; k < chars.length; k++) {
            var g = FONT[chars[k]], w = g[0].length;
            if (fx < at + w) { on = fx >= at && g[fy].charAt(fx - at) === '1'; break; }
            at += w + 1;
          }
        }
        mask[y * cols + x] = on;
      }
    }
    return mask;
  }

  // The slow drift: the stencil moves at most one cell, one step a minute,
  // round a small square loop, so the time never sits on the same cells
  // for long.
  var DRIFT = [[0, 0], [1, 0], [1, 1], [0, 1]];
  function drift(date) { return DRIFT[date.getMinutes() % DRIFT.length]; }

  // A new stream for column x: speed 9 to 23 rows a second, a trail of 8 to
  // 25 rows. At start (scatter) streams are spread over the screen; later
  // ones start above it.
  function newDrop(rows, rng, scatter) {
    return {
      y: scatter ? rng() * rows * 1.5 - rows * 0.5 : -rng() * rows * 0.6,
      v: 9 + rng() * 14,
      len: 8 + Math.floor(rng() * 18),
      mirror: rng() < 0.5
    };
  }

  // The whole rain: one stream per column, and per cell its glyph, how lit
  // it is (0 to 1) and when its glyph next changes.
  function create(cols, rows, glyphs, rng) {
    var n = cols * rows, state = { cols: cols, rows: rows, glyphs: glyphs, drops: [],
      glyph: new Array(n), lit: new Float32Array(n), change: new Float32Array(n) };
    for (var x = 0; x < cols; x++) state.drops.push(newDrop(rows, rng, true));
    for (var i = 0; i < n; i++) {
      state.glyph[i] = glyphs[Math.floor(rng() * glyphs.length)];
      state.change[i] = rng() * 2;
    }
    return state;
  }

  var SPEEDS = { calm: 0.55, normal: 1, fast: 1.7 };

  // Advance the rain by dt seconds. speed is a factor (SPEEDS, times 0.4 for
  // reduced motion); mask is the stencil, or null for rain only.
  //   - A stencil cell lights when a stream's trail passes through it, then
  //     rises to full and stays while it is in the stencil.
  //   - A lit cell no longer in the stencil fades out.
  //   - Glyphs change at random, those in the time about 12 times more
  //     slowly than the rain's.
  function step(state, dt, speed, mask, rng) {
    var cols = state.cols, rows = state.rows;
    for (var x = 0; x < cols; x++) {
      var dr = state.drops[x];
      dr.y += dr.v * speed * dt;
      if (dr.y - dr.len > rows) state.drops[x] = dr = newDrop(rows, rng, false);
      for (var y = 0; y < rows; y++) {
        var i = y * cols + x;
        var inMask = mask !== null && mask[i];
        var dist = dr.y - y;
        if (inMask && dist >= 0 && dist < dr.len) state.lit[i] = Math.max(state.lit[i], 0.15);
        if (inMask && state.lit[i] > 0) state.lit[i] = Math.min(1, state.lit[i] + dt * 1.6);
        if (!inMask && state.lit[i] > 0) state.lit[i] = Math.max(0, state.lit[i] - dt * 0.7);
        state.change[i] -= dt * (inMask ? 0.12 : 1.4) * speed;
        if (state.change[i] <= 0) {
          state.glyph[i] = state.glyphs[Math.floor(rng() * state.glyphs.length)];
          state.change[i] = 0.4 + rng() * 2.2;
        }
      }
    }
  }

  // How bright a cell's rain is (0 to 1), and whether it is a stream's head.
  function trail(state, x, y) {
    var dr = state.drops[x], dist = dr.y - y;
    if (dist < 0 || dist >= dr.len) return { b: 0, head: false };
    return { b: 1 - dist / dr.len, head: dist < 1 };
  }

  // The frame rate adapts to the device: 30, 20 or 15 frames a second. With
  // the median of the last frames' work over 80 % of the frame's budget it
  // steps down; under 40 % of the faster rate's budget it steps back up.
  var RATES = [30, 20, 15];
  function adaptRate(fps, frameMs) {
    if (frameMs.length < 15) return fps;
    var sorted = frameMs.slice().sort(function (a, b) { return a - b; });
    var median = sorted[Math.floor(sorted.length / 2)];
    var at = RATES.indexOf(fps);
    if (at < 0) return RATES[0];
    if (at < RATES.length - 1 && median > 0.8 * (1000 / fps)) return RATES[at + 1];
    if (at > 0 && median < 0.4 * (1000 / RATES[at - 1])) return RATES[at - 1];
    return fps;
  }

  // Whether the device's fonts draw the katakana. render(ch) gives a
  // signature of how ch draws (pixels as a string, say). A glyph the fonts
  // lack draws as the same empty box as a codepoint no font has, or as
  // nothing at all. If any katakana does, use digits only.
  var MISSING = '￾';
  function kanaDraws(render) {
    var box = render(MISSING), blank = render(' ');
    for (var i = 0; i < KANA.length; i++) {
      var sig = render(KANA[i]);
      if (sig === box || sig === blank) return false;
    }
    return true;
  }

  var api = {
    FONT: FONT, KANA: KANA, DIGITS: DIGITS, SPEEDS: SPEEDS, RATES: RATES, MISSING: MISSING,
    pool: pool, timeText: timeText, stencil: stencil, drift: drift, create: create, step: step,
    trail: trail, adaptRate: adaptRate, kanaDraws: kanaDraws
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Rain = api;
}(this));
