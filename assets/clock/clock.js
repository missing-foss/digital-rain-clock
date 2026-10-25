// SPDX-License-Identifier: Apache-2.0
// The screensaver: draws the rain on a canvas, with the time forming out of
// it. rain.js decides what lights; this draws it, from glyphs pre-drawn once
// into an atlas, at 30, 20 or 15 frames a second as the device allows.
// Kiosk Satellite passes the settings in the URL fragment and recreates the
// page when they change.
(function () {
  'use strict';
  var options = {};
  try { options = JSON.parse(decodeURIComponent(location.hash.slice(1) || '%7B%7D')); } catch (_) {}

  // The colour as a hue and a saturation: three presets, or a chosen colour.
  var PRESETS = { Green: [145, 75], Amber: [36, 90], Ice: [195, 70] };
  function hueSat(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
    if (d === 0) return [0, 0];
    var h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    var s = d / (1 - Math.abs(2 * l - 1));
    return [Math.round((h * 60 + 360) % 360), Math.round(Math.min(1, s) * 100)];
  }
  var colour = options.colour === 'Custom' && /^#[0-9a-fA-F]{6}$/.test(options.customColour || '')
    ? hueSat(options.customColour) : (PRESETS[options.colour] || PRESETS.Green);
  var HUE = colour[0], SAT = colour[1];
  var showTime = options.time !== 'Rain only';
  var twelve = options.clock === '12-hour';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var speed = (Rain.SPEEDS[String(options.speed || 'Normal').toLowerCase()] || 1) * (reduced ? 0.4 : 1);

  var canvas = document.getElementById('rain');
  var ctx = canvas.getContext('2d');
  var GLYPH_FONT = '"Noto Sans Mono CJK JP", "Noto Sans CJK JP", "Droid Sans Fallback", monospace';

  // Whether the device's fonts draw every katakana: each glyph's pixels
  // against those of a codepoint no font has, and against nothing.
  function render(ch) {
    var c = document.createElement('canvas');
    c.width = 24; c.height = 24;
    var x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.font = '20px ' + GLYPH_FONT;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(ch, 12, 12);
    return Array.prototype.join.call(x.getImageData(0, 0, 24, 24).data, ',');
  }
  var kana = options.glyphs !== 'Digits only' && Rain.kanaDraws(render);
  var glyphs = Rain.pool(kana);

  var W, H, cell, cols, rows, state, mask = null, maskKey = '';
  var atlas, slots = {};
  var LEVELS = 8;     // brightness steps of the rain

  // Every glyph pre-drawn once: the rain in LEVELS brightness steps, mirrored
  // and not, plus a near-white head and the lit time with its glow. A frame
  // then only copies from here: no text drawing, no live blur.
  function buildAtlas() {
    var kinds = LEVELS * 2 + 2;    // rain levels, mirrored rain levels, head, lit
    atlas = document.createElement('canvas');
    atlas.width = cell * glyphs.length;
    atlas.height = cell * kinds;
    var a = atlas.getContext('2d');
    a.font = '500 ' + Math.round(cell * 0.86) + 'px ' + GLYPH_FONT;
    a.textAlign = 'center';
    a.textBaseline = 'middle';
    glyphs.forEach(function (g, gi) {
      slots[g] = gi;
      var cx = gi * cell + cell / 2;
      for (var k = 0; k < kinds; k++) {
        var cy = k * cell + cell / 2;
        a.save();
        a.shadowBlur = 0;
        if (k < LEVELS * 2) {
          var b = ((k % LEVELS) + 1) / LEVELS;
          a.globalAlpha = Math.min(1, 0.15 + b) * (showTime ? 0.55 : 1);
          a.fillStyle = 'hsl(' + HUE + ',' + SAT + '%,' + Math.round(18 + 42 * b) + '%)';
          if (k >= LEVELS && g > '9') { a.translate(cx, cy); a.scale(-1, 1); a.fillText(g, 0, 0); a.restore(); continue; }
        } else if (k === LEVELS * 2) {
          a.globalAlpha = showTime ? 0.7 : 1;
          a.fillStyle = 'hsl(' + HUE + ',40%,92%)';
        } else {
          // The time: a soft block behind a near-white, glowing glyph.
          a.globalAlpha = 0.34;
          a.fillStyle = 'hsl(' + HUE + ',' + SAT + '%,32%)';
          a.fillRect(gi * cell, k * cell, cell, cell);
          a.globalAlpha = 1;
          a.shadowColor = 'hsl(' + HUE + ',' + SAT + '%,55%)';
          a.shadowBlur = cell * 0.45;
          a.fillStyle = 'hsl(' + HUE + ',' + Math.round(SAT * 0.5) + '%,92%)';
        }
        a.fillText(g, cx, cy);
        a.restore();
      }
    });
  }

  // About 64 columns on a landscape tablet; whole cells, whole pixels.
  function resize() {
    var dpr = window.devicePixelRatio || 1;
    W = canvas.width = Math.round(window.innerWidth * dpr);
    H = canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    cell = Math.max(10, Math.round(Math.min(window.innerWidth / 64, window.innerHeight / 38))) * dpr;
    cols = Math.ceil(W / cell);
    rows = Math.ceil(H / cell);
    state = Rain.create(cols, rows, glyphs, Math.random);
    maskKey = '';
    buildAtlas();
  }

  function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    for (var x = 0; x < cols; x++) {
      var mirror = state.drops[x].mirror;
      for (var y = 0; y < rows; y++) {
        var i = y * cols + x, lit = state.lit[i], t = Rain.trail(state, x, y);
        if (t.b < 0.02 && lit < 0.02) continue;     // dark: nothing to draw
        var row;
        if (lit > 0.3 || (lit >= t.b && lit > 0.02)) { row = LEVELS * 2 + 1; ctx.globalAlpha = Math.min(1, 0.35 + lit); }
        else if (t.head) { row = LEVELS * 2; ctx.globalAlpha = 1; }
        else { row = (mirror ? LEVELS : 0) + Math.min(LEVELS - 1, Math.floor(t.b * LEVELS)); ctx.globalAlpha = 1; }
        ctx.drawImage(atlas, slots[state.glyph[i]] * cell, row * cell, cell, cell, x * cell, y * cell, cell, cell);
      }
    }
    ctx.globalAlpha = 1;
  }

  // The frame loop: work out the stencil once a minute, step the rain by
  // the real time passed, draw, and adapt the frame rate to what the device
  // manages. The median of the last frames' work decides.
  var fps = Rain.RATES[0], work = [], last = performance.now();
  function frame() {
    var start = performance.now();
    var dt = Math.min(0.1, (start - last) / 1000);
    last = start;
    var now = new Date();
    var key = showTime ? Rain.timeText(now, twelve) + (options.drift === false ? '' : Rain.drift(now).join(',')) : '';
    if (key !== maskKey) {
      maskKey = key;
      var d = options.drift === false ? [0, 0] : Rain.drift(now);
      mask = showTime ? Rain.stencil(Rain.timeText(now, twelve), cols, rows, d[0], d[1]) : null;
    }
    Rain.step(state, dt, speed, mask, Math.random);
    draw();
    work.push(performance.now() - start);
    if (work.length > 30) work.shift();
    var next = Rain.adaptRate(fps, work);
    if (next !== fps) { fps = next; work = []; }
    setTimeout(frame, Math.max(0, 1000 / fps - (performance.now() - start)));
  }

  window.addEventListener('resize', resize);
  resize();
  frame();
}());
