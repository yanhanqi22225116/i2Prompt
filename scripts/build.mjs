import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const root = process.cwd();
const checkOnly = process.argv.includes('--check');

const srcExtension = path.join(root, 'src/extension');
const srcShared = path.join(root, 'src/shared');
const srcUserscript = path.join(root, 'src/userscript/i2prompt-userscript.js');
const dist = path.join(root, 'dist');
const distExtension = path.join(dist, 'extension');

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(distExtension, { recursive: true });
await fs.cp(srcExtension, distExtension, { recursive: true });
await fs.cp(srcShared, path.join(distExtension, 'shared'), { recursive: true });

await writeUserscript();
await writeIcons();
await validateJson(path.join(distExtension, 'manifest.json'));

if (!checkOnly) {
  console.log('build ok');
  console.log(`extension: ${path.relative(root, distExtension)}`);
  console.log('userscript: dist/i2prompt.user.js');
}

async function writeUserscript() {
  const shared = await fs.readFile(path.join(srcShared, 'i2prompt-shared.js'), 'utf8');
  const main = await fs.readFile(srcUserscript, 'utf8');
  const meta = [
    '// ==UserScript==',
    '// @name         i2Prompt',
    '// @namespace    https://local.i2prompt',
    '// @version      0.1.1',
    '// @description  网页图片右键反推 AI 绘画提示词，并自动复制结果。',
    '// @match        http://*/*',
    '// @match        https://*/*',
    '// @run-at       document-end',
    '// @grant        GM_xmlhttpRequest',
    '// @grant        GM_getValue',
    '// @grant        GM_setValue',
    '// @grant        GM_setClipboard',
    '// @grant        GM_registerMenuCommand',
    '// @connect      *',
    '// ==/UserScript==',
    ''
  ].join('\n');
  await fs.writeFile(path.join(dist, 'i2prompt.user.js'), `${meta}\n${shared}\n\n${main}\n`, 'utf8');
}

async function writeIcons() {
  const iconDir = path.join(distExtension, 'icons');
  const srcIconDir = path.join(srcExtension, 'icons');
  await fs.mkdir(iconDir, { recursive: true });
  const hasSourceIcons = await hasFiles([16, 48, 128].map((size) => path.join(srcIconDir, `icon${size}.png`)));
  if (hasSourceIcons) {
    for (const size of [16, 48, 128]) {
      await fs.copyFile(path.join(srcIconDir, `icon${size}.png`), path.join(iconDir, `icon${size}.png`));
    }
    return;
  }
  for (const size of [16, 48, 128]) {
    const png = makeIcon(size);
    await fs.writeFile(path.join(iconDir, `icon${size}.png`), png);
  }
}

async function hasFiles(files) {
  try {
    await Promise.all(files.map((file) => fs.access(file)));
    return true;
  } catch (_) {
    return false;
  }
}

function makeIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const r = 16;
      const g = 24 + Math.floor((y / size) * 18);
      const b = 32 + Math.floor((x / size) * 20);
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;

      const pad = Math.max(2, Math.floor(size * 0.16));
      if (x >= pad && x <= pad + Math.max(2, Math.floor(size * 0.13)) && y >= pad && y <= size - pad) {
        pixels[i] = 22;
        pixels[i + 1] = 160;
        pixels[i + 2] = 133;
      }
      if (x + y > size * 0.92 && x + y < size * 1.14 && x > size * 0.35 && y > size * 0.22) {
        pixels[i] = 239;
        pixels[i + 1] = 71;
        pixels[i + 2] = 111;
      }
    }
  }

  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', Buffer.concat([
      uint32(size),
      uint32(size),
      Buffer.from([8, 6, 0, 0, 0])
    ])),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const crcInput = Buffer.concat([typeBuffer, data]);
  return Buffer.concat([
    uint32(data.length),
    typeBuffer,
    data,
    uint32(crc32(crcInput))
  ]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function validateJson(file) {
  JSON.parse(await fs.readFile(file, 'utf8'));
}
