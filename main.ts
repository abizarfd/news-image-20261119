// The World in One Day — Thursday 19 November 2026.
// A generative newspaper front page drawn with Node's standard library only.
// Writes a deterministic 1024x1024 PNG to /output/entry.png
// (or $MAKEFUN_OUTPUT_DIR/entry.png outside the grader).
// No network, no randomness, no dates read at runtime: the same bytes every run.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;

// Palette: warm newsprint paper, dark ink, signal red, deep navy.
const PAPER: [number, number, number] = [247, 242, 231];
const PAPER_DIM: [number, number, number] = [238, 231, 214];
const INK: [number, number, number] = [22, 26, 34];
const INK_SOFT: [number, number, number] = [74, 80, 92];
const RED: [number, number, number] = [178, 38, 30];
const NAVY: [number, number, number] = [29, 58, 110];
const NAVY_DARK: [number, number, number] = [16, 28, 54];
const GOLD: [number, number, number] = [190, 148, 40];
const TEAL: [number, number, number] = [20, 101, 90];
const SKY: [number, number, number] = [122, 168, 205];
const CREAM: [number, number, number] = [247, 242, 231];
const WHITE: [number, number, number] = [255, 255, 255];

type RGB = [number, number, number];

// The canvas: one RGB byte triple per pixel, row-major.
const px = Buffer.alloc(W * H * 3);

function put(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w);
  const y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      i += 3;
    }
  }
}

function hline(x0: number, x1: number, y: number, c: RGB): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) put(x, y, c);
}

function vline(x: number, y0: number, y1: number, c: RGB): void {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) put(x, y, c);
}

// Bresenham line, any slope.
function line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    put(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function thickLine(x0: number, y0: number, x1: number, y1: number, t: number, c: RGB): void {
  const half = Math.floor(t / 2);
  for (let ox = -half; ox <= half; ox++) {
    for (let oy = -half; oy <= half; oy++) {
      line(x0 + ox, y0 + oy, x1 + ox, y1 + oy, c);
    }
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    for (let dx = -half; dx <= half; dx++) put(cx + dx, cy + dy, c);
  }
}

function ring(cx: number, cy: number, r: number, t: number, c: RGB): void {
  for (let a = 0; a < 360; a++) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++) {
      put(Math.round(cx + (r - k) * Math.cos(rad)), Math.round(cy + (r - k) * Math.sin(rad)), c);
    }
  }
}

// Filled half-ellipse (dome): top half of an ellipse centred at (cx, cy).
function fillDome(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let dy = -ry; dy <= 0; dy++) {
    const half = Math.floor(rx * Math.sqrt(1 - (dy * dy) / (ry * ry)));
    for (let dx = -half; dx <= half; dx++) put(cx + dx, cy + dy, c);
  }
}

// Filled triangle through three points, scanline fill.
function fillTriangle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: RGB): void {
  const minY = Math.min(ay, by, cy);
  const maxY = Math.max(ay, by, cy);
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    const edges: Array<[number, number, number, number]> = [
      [ax, ay, bx, by],
      [bx, by, cx, cy],
      [cx, cy, ax, ay],
    ];
    for (const [x0, y0, x1, y1] of edges) {
      if ((y0 <= y && y < y1) || (y1 <= y && y < y0)) {
        xs.push(Math.round(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0)));
      }
    }
    if (xs.length >= 2) {
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      for (let x = lo; x <= hi; x++) put(x, y, c);
    }
  }
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font, drawn from scratch. Each glyph is 7 rows; each row is a
// 5-bit number, bit 4 = leftmost pixel. Only capitals, digits and the
// punctuation the page needs — every line of copy on the page is uppercase.
// ---------------------------------------------------------------------------
const FONT: Record<string, number[]> = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b01100, 0b01100],
  ',': [0, 0, 0, 0, 0b01100, 0b00100, 0b01000],
  ':': [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
  ';': [0, 0b01100, 0b01100, 0, 0b01100, 0b00100, 0b01000],
  "'": [0b00100, 0b00100, 0b01000, 0, 0, 0, 0],
  '"': [0b01010, 0b01010, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b01110, 0, 0, 0],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  '&': [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
  '%': [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  '?': [0b01110, 0b10001, 0b00001, 0b00110, 0b00100, 0, 0b00100],
  '=': [0, 0, 0b11111, 0, 0b11111, 0, 0],
  $: [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100],
  '|': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
};

// One glyph cell is 6 units wide (5 + 1 spacing), 7 tall.
function drawChar(ch: string, x: number, y: number, s: number, c: RGB): void {
  const g = FONT[ch] ?? FONT['?'];
  for (let row = 0; row < 7; row++) {
    const bits = g[row];
    for (let col = 0; col < 5; col++) {
      if (bits & (1 << (4 - col))) {
        fillRect(x + col * s, y + row * s, s, s, c);
      }
    }
  }
}

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale;
}

function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  for (let i = 0; i < s.length; i++) {
    drawChar(s[i], x + i * 6 * scale, y, scale, c);
  }
}

function drawTextCentered(s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}

// Greedy word wrap: returns lines that fit maxW pixels at the given scale.
function wrap(s: string, maxW: number, scale: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur === '' ? w : cur + ' ' + w;
    if (textWidth(trial, scale) <= maxW) {
      cur = trial;
    } else {
      if (cur !== '') lines.push(cur);
      cur = w;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder: 8-bit RGB, filter 0 on every scanline, zlib level 9.
// ---------------------------------------------------------------------------
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    px.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// Pictograms. Each draws inside the box (x, y, w, h) in its accent colour.
// Simple flat geometry: poles, beams, arcs, bars — no clip art, no text.
// ---------------------------------------------------------------------------

// 1. Three-way summit: three flag poles, three flags, three figures.
function iconSummit(x: number, y: number, w: number, h: number): void {
  const gy = y + h - 18; // ground line
  hline(x + 6, x + w - 6, gy, INK_SOFT);
  const cols: RGB[] = [RED, NAVY, GOLD];
  const pxs = [0.22, 0.5, 0.78];
  for (let i = 0; i < 3; i++) {
    const poleX = Math.round(x + w * pxs[i]);
    vline(poleX, y + 14, gy, INK);
    // flag: small pennant flying right from the pole top
    fillTriangle(poleX, y + 14, poleX + 34, y + 22, poleX, y + 30, cols[i]);
    // figure: head + shoulders below the pole
    fillCircle(poleX, gy - 16, 7, INK);
    fillRect(poleX - 9, gy - 8, 18, 8, INK);
  }
}

// 2. Bridge over water, hit mid-span: deck, arch, towers, burst.
function iconBridge(x: number, y: number, w: number, h: number): void {
  const deckY = y + Math.floor(h * 0.42);
  const waterY = y + h - 26;
  // water: three wavy strokes
  for (let k = 0; k < 3; k++) {
    const yy = waterY + k * 7;
    for (let xx = x + 8; xx < x + w - 8; xx += 16) {
      hline(xx, xx + 9, yy, SKY);
    }
  }
  // towers
  fillRect(x + Math.floor(w * 0.2), y + 12, 8, deckY - y - 8, INK);
  fillRect(x + Math.floor(w * 0.74), y + 12, 8, deckY - y - 8, INK);
  // deck
  fillRect(x + 6, deckY, w - 12, 7, INK);
  // arch under the deck, solid two-pixel curve
  for (let a = 0; a <= 180; a += 1) {
    const rad = (a * Math.PI) / 180;
    const ax = Math.round(x + w / 2 + (w / 2 - 10) * Math.cos(rad));
    const ay = Math.round(deckY + 6 + (waterY - deckY - 12) * Math.sin(rad));
    put(ax, ay, INK);
    put(ax, ay + 1, INK);
  }
  // burst at mid-span: red star
  const bx = Math.round(x + w / 2);
  const by = deckY - 12;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    line(bx, by, Math.round(bx + 16 * Math.cos(a)), Math.round(by + 16 * Math.sin(a)), RED);
  }
  fillCircle(bx, by, 6, RED);
  fillCircle(bx, by, 3, GOLD);
}

// 3. Gulf strike: flame over waves, diagonal missile trail.
function iconFlame(x: number, y: number, w: number, h: number): void {
  const baseY = y + h - 30;
  // missile trail, top-right down to the flame's shoulder
  thickLine(x + w - 12, y + 10, x + Math.floor(w * 0.62), y + Math.floor(h * 0.38), 3, INK_SOFT);
  fillCircle(x + w - 12, y + 10, 4, INK);
  // flame: stacked triangles, red outer, gold inner, pale core
  const fx = Math.round(x + w * 0.42);
  fillTriangle(fx - 30, baseY, fx, y + 12, fx + 30, baseY, RED);
  fillTriangle(fx - 18, baseY, fx, y + 30, fx + 18, baseY, GOLD);
  fillTriangle(fx - 8, baseY, fx, y + 46, fx + 8, baseY, [255, 220, 120]);
  // waves
  for (let k = 0; k < 2; k++) {
    const yy = baseY + 8 + k * 8;
    for (let xx = x + 8; xx < x + w - 8; xx += 16) {
      hline(xx, xx + 9, yy, SKY);
    }
  }
}

// 4. Record debut: rising bars and an arrow breaking upward.
function iconChart(x: number, y: number, w: number, h: number): void {
  const baseY = y + h - 16;
  // axes
  hline(x + 10, x + w - 10, baseY, INK);
  vline(x + 10, y + 12, baseY, INK);
  const bars: Array<[number, RGB]> = [
    [0.2, NAVY],
    [0.42, TEAL],
    [0.64, GOLD],
  ];
  const heights = [0.3, 0.52, 0.78];
  for (let i = 0; i < 3; i++) {
    const bw = Math.floor(w * 0.14);
    const bx = Math.round(x + w * bars[i][0]) - Math.floor(bw / 2);
    const bh = Math.floor((h - 40) * heights[i]);
    fillRect(bx, baseY - bh, bw, bh, bars[i][1]);
  }
  // arrow: from first bar top to above the third, with head
  const ax0 = Math.round(x + w * 0.2);
  const ay0 = baseY - Math.floor((h - 40) * 0.3) - 6;
  const ax1 = Math.round(x + w * 0.86);
  const ay1 = y + 14;
  thickLine(ax0, ay0, ax1, ay1, 3, RED);
  fillTriangle(ax1, ay1, ax1 - 14, ay1 + 2, ax1 - 2, ay1 + 14, RED);
}

// 5. The court: scales of justice on a plinth.
function iconScales(x: number, y: number, w: number, h: number): void {
  const cx = Math.round(x + w / 2);
  const baseY = y + h - 16;
  // plinth
  fillRect(x + 14, baseY, w - 28, 6, INK);
  fillRect(cx - 3, y + 22, 6, baseY - y - 22, INK);
  // beam
  fillRect(cx - Math.floor(w * 0.32), y + 22, Math.floor(w * 0.64), 5, INK);
  // finial
  fillCircle(cx, y + 16, 5, GOLD);
  // pans
  for (const side of [-1, 1]) {
    const px0 = cx + side * Math.floor(w * 0.3);
    const py0 = y + 27;
    line(px0, py0, px0 - 16, py0 + 30, INK);
    line(px0, py0, px0 + 16, py0 + 30, INK);
    fillTriangle(px0 - 18, py0 + 30, px0 + 18, py0 + 30, px0, py0 + 46, NAVY);
  }
}

// 6. The Capitol: dome, drum, columns, steps. Sized to fit its box exactly:
// base at the bottom, lantern on the dome's crown, nothing above y.
function iconDome(x: number, y: number, w: number, h: number): void {
  const cx = Math.round(x + w / 2);
  const baseY = y + h - 8;
  // steps
  fillRect(x + 12, baseY, w - 24, 5, INK);
  fillRect(x + 20, baseY - 6, w - 40, 6, INK);
  // columns
  const colTop = y + Math.floor(h * 0.55);
  for (let i = -2; i <= 2; i++) {
    fillRect(cx + i * 18 - 3, colTop, 6, baseY - 6 - colTop, INK);
  }
  // entablature + drum
  fillRect(cx - 52, colTop - 7, 104, 7, INK);
  fillRect(cx - 30, colTop - 20, 60, 13, NAVY);
  // dome: crown sits 18 above the drum, lantern on the crown
  fillDome(cx, colTop - 20, 40, 18, NAVY);
  fillRect(cx - 2, colTop - 40, 4, 4, INK);
  fillCircle(cx, colTop - 42, 3, GOLD);
}

// ---------------------------------------------------------------------------
// The day's stories: Thursday 19 November 2026.
// ---------------------------------------------------------------------------
interface Story {
  kicker: string;
  headline: string;
  body: string;
  accent: RGB;
  icon: (x: number, y: number, w: number, h: number) => void;
}

const LEAD: Story = {
  kicker: 'APEC SUMMIT | SHENZHEN, CHINA',
  headline: 'TRUMP, XI AND PUTIN MEET IN SHENZHEN',
  body: 'THE THREE LEADERS HOLD THEIR FIRST THREE-WAY SUMMIT ON THE SIDELINES OF THE APEC FORUM, WITH NUCLEAR ARMS AND TWO WARS ON THE TABLE.',
  accent: RED,
  icon: iconSummit,
};

const GRID: Story[] = [
  {
    kicker: 'UKRAINE | WAR',
    headline: 'UKRAINE HITS CRIMEA BRIDGE AGAIN',
    body: 'KYIV STRIKES THE BRIDGE FOR THE THIRD TIME IN A WEEK AS DIPLOMATS MEET IN SHENZHEN.',
    accent: NAVY,
    icon: iconBridge,
  },
  {
    kicker: 'MIDDLE EAST | CONFLICT',
    headline: 'IRAN STRIKES GULF AFTER US HIT',
    body: 'TEHRAN WIDENS ATTACKS ON GULF STATES AFTER US FORCES STRUCK A MISSILE SITE ON QESHM ISLAND.',
    accent: RED,
    icon: iconFlame,
  },
  {
    kicker: 'TECH | MARKETS',
    headline: "ANTHROPIC'S RECORD MARKET DEBUT",
    body: 'THE AI LAB RAISES A RECORD SUM IN ITS STOCK MARKET DEBUT, THE BIGGEST LISTING OF ITS KIND.',
    accent: TEAL,
    icon: iconChart,
  },
  {
    kicker: 'JUSTICE | THE HAGUE',
    headline: 'COURT TO RULE ON MYANMAR CASE',
    body: "THE WORLD'S TOP COURT PREPARES TO RULE ON GENOCIDE CLAIMS AGAINST MYANMAR OVER THE ROHINGYA.",
    accent: NAVY,
    icon: iconScales,
  },
];

const STRIP: Story = {
  kicker: 'USA | POLITICS',
  headline: 'JEFFRIES SET TO MAKE HISTORY',
  body: 'DEMOCRATS NOMINATE HAKEEM JEFFRIES, IN LINE TO BECOME THE FIRST BLACK SPEAKER OF THE HOUSE.',
  accent: GOLD,
  icon: iconDome,
};

const TICKER =
  'VOYAGER 1 NEARS ONE LIGHT-DAY | EU APPROVES INDONESIA TRADE PACT | GTA 6 PARTLY BUILT IN BENGALURU | RANSOMWARE GROUP N0N CLAIMS 59 FIRMS';

const MX = 28; // side margin
const RX = W - MX; // right edge of the text column

function box(x: number, y: number, w: number, h: number, bg: RGB): void {
  fillRect(x, y, w, h, bg);
  hline(x, x + w - 1, y, INK);
  hline(x, x + w - 1, y + h - 1, INK);
  vline(x, y, y + h - 1, INK);
  vline(x + w - 1, y, y + h - 1, INK);
}

function drawMasthead(): void {
  drawTextCentered('WORLD EDITION', W / 2, 14, 2, INK_SOFT);
  drawTextCentered('THE WORLD IN ONE DAY', W / 2, 36, 5, INK);
  drawTextCentered('THURSDAY 19 NOVEMBER 2026', W / 2, 86, 3, RED);
  fillRect(MX, 114, RX - MX, 3, INK);
  fillRect(MX, 121, RX - MX, 2, RED);
}

function drawLead(): void {
  box(MX, 148, 190, 176, PAPER_DIM);
  LEAD.icon(MX + 4, 152, 182, 168);
  drawText(LEAD.kicker, 238, 160, 2, LEAD.accent);
  const head = wrap(LEAD.headline, RX - 238, 3);
  head.forEach((ln, i) => drawText(ln, 238, 186 + i * 27, 3, INK));
  const body = wrap(LEAD.body, RX - 238, 2);
  body.forEach((ln, i) => drawText(ln, 238, 230 + i * 20, 2, INK));
  fillRect(MX, 344, RX - MX, 2, INK);
}

function drawGrid(): void {
  const cols = [MX, 524];
  const rows = [356, 578];
  for (let i = 0; i < 4; i++) {
    const s = GRID[i];
    const x = cols[i % 2];
    const y = rows[Math.floor(i / 2)];
    box(x, y, 150, 104, PAPER_DIM);
    s.icon(x + 4, y + 4, 142, 96);
    drawText(s.kicker, x + 162, y + 4, 2, s.accent);
    const head = wrap(s.headline, 310, 3).slice(0, 3);
    head.forEach((ln, j) => drawText(ln, x + 162, y + 28 + j * 27, 3, INK));
    const body = wrap(s.body, 472, 2).slice(0, 3);
    body.forEach((ln, j) => drawText(ln, x, y + 118 + j * 20, 2, INK));
  }
  // column + row gutters
  vline(512, 356, 788, INK_SOFT);
  hline(MX, RX, 572, INK_SOFT);
}

function drawStrip(): void {
  box(MX, 808, 130, 88, PAPER_DIM);
  STRIP.icon(MX + 4, 812, 122, 80);
  drawText(STRIP.kicker, 170, 810, 2, STRIP.accent);
  const head = wrap(STRIP.headline, RX - 170, 3);
  head.forEach((ln, i) => drawText(ln, 170, 834 + i * 27, 3, INK));
  const body = wrap(STRIP.body, RX - 170, 2).slice(0, 2);
  body.forEach((ln, i) => drawText(ln, 170, 866 + i * 20, 2, INK));
  fillRect(MX, 916, RX - MX, 2, INK);
}

function drawTicker(): void {
  fillRect(0, 924, W, H - 924, NAVY_DARK);
  drawText('ALSO TODAY', 40, 938, 2, GOLD);
  const lines = wrap(TICKER, W - 80, 2).slice(0, 2);
  lines.forEach((ln, i) => drawText(ln, 40, 962 + i * 20, 2, CREAM));
}

function main(): void {
  fillRect(0, 0, W, H, PAPER);
  drawMasthead();
  drawLead();
  drawGrid();
  drawStrip();
  drawTicker();
  const png = encodePNG();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), png);
  // eslint-disable-next-line no-console
  console.log(`wrote ${png.length} bytes to ${join(outDir, 'entry.png')}`);
}

main();
