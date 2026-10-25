// SPDX-License-Identifier: Apache-2.0
// The manifest: the plugin's identity, its icon in place and to the
// directory's rules, and the renderer's entry page in the package.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'kiosk-satellite-plugin.json'), 'utf8'));

test('the manifest names the plugin, its entry class and its screensaver', () => {
  assert.strictEqual(manifest.id, 'digital-rain-clock');
  assert.strictEqual(manifest.name, 'Digital Rain Clock');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.deepStrictEqual(manifest.capabilities, ['screensaver']);
  const entry = path.join(root, 'src', ...manifest.entryClass.split('.')) + '.java';
  assert.ok(fs.existsSync(entry), `${manifest.entryClass} has a source file`);
  assert.ok(fs.existsSync(path.join(root, 'assets', 'clock', 'index.html')), 'the renderer page is packaged');
});

test('the icon is a 256 by 256 PNG of at most 256 KB under assets/, with its SVG source', () => {
  const png = fs.readFileSync(path.join(root, 'assets', manifest.icon));
  assert.ok(png.length <= 256 * 1024, `${png.length} bytes`);
  assert.deepStrictEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'a PNG');
  assert.strictEqual(png.toString('ascii', 12, 16), 'IHDR');
  assert.deepStrictEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [256, 256]);
  assert.ok(fs.existsSync(path.join(root, 'art', 'icon.svg')), 'the source is kept');
});

test('the settings: what the page reads, with the defaults the design chose', () => {
  const byKey = Object.fromEntries(manifest.settings.map((s) => [s.key, s]));
  assert.deepStrictEqual(Object.keys(byKey), ['time', 'colour', 'customColour', 'speed', 'glyphs', 'clock', 'drift']);
  assert.deepStrictEqual(byKey.colour.options, ['Green', 'Amber', 'Ice', 'Custom']);
  assert.strictEqual(byKey.customColour.type, 'color');
  assert.strictEqual(byKey.customColour.default, '#3DDC84');
  assert.deepStrictEqual(byKey.customColour.visibleWhen, { key: 'colour', equals: 'Custom' });
  assert.deepStrictEqual(byKey.speed.options, ['Calm', 'Normal', 'Fast']);
  assert.strictEqual(byKey.speed.default, 'Normal');
  assert.deepStrictEqual(byKey.clock.options, ['24-hour', '12-hour']);
  assert.strictEqual(byKey.drift.default, true);
  for (const s of manifest.settings) assert.ok(s.options === undefined || s.options.includes(s.default), `${s.key}: default is an option`);
});
