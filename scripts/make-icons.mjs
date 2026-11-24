// Gera os ícones do app e da bandeja (PNG/ICO) sem dependências externas.
// Uso: node scripts/make-icons.mjs
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const OUT = 'resources/icons';
mkdirSync(OUT, { recursive: true });

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const palettes = {
  app: ['#34d399', '#0f766e'],
  listening: ['#34d399', '#0f766e'],
  paused: ['#a1a1aa', '#52525b'],
  error: ['#fb7185', '#b91c1c'],
  busy: ['#7dd3fc', '#4338ca'],
};

function inRoundRect(x, y, cx, cy, w, h) {
  const r = w / 2;
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);
  if (dx > w / 2 || dy > h / 2) return false;
  if (dy <= h / 2 - r) return true;
  const ey = dy - (h / 2 - r);
  return dx * dx + ey * ey <= r * r;
}

function shape(x, y) {
  // Balão de conversa: círculo + "rabinho" no canto inferior esquerdo
  const cx = 0.5, cy = 0.47, R = 0.42;
  const inCircle = (x - cx) ** 2 + (y - cy) ** 2 <= R * R;
  const inTail = y > 0.7 && y < 0.95 && x > 0.14 && x < 0.42 && x - 0.14 < (0.95 - y) * 1.1 && x > 0.14 + (y - 0.7) * 0.25;
  if (!inCircle && !inTail) return 0;
  const bars = [
    [0.35, 0.22],
    [0.5, 0.38],
    [0.65, 0.22],
  ];
  for (const [bx, bh] of bars) if (inRoundRect(x, y, bx, cy, 0.08, bh)) return 2;
  return 1;
}

/** scale < 1 encolhe o desenho no centro (margem para os ícones adaptativos do Android). */
function render(size, [c1, c2], scale = 1) {
  const a = hex(c1), b = hex(c2);
  const S = 4; // supersampling
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let fill = 0, white = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = ((x + (sx + 0.5) / S) / size - 0.5) / scale + 0.5;
          const w = ((y + (sy + 0.5) / S) / size - 0.5) / scale + 0.5;
          const v = shape(u, w);
          if (v) fill++;
          if (v === 2) white++;
        }
      }
      const t = (x + y) / (2 * size);
      const base = a.map((c, i) => c + (b[i] - c) * t);
      const wf = fill ? white / fill : 0;
      const o = (y * size + x) * 4;
      for (let i = 0; i < 3; i++) px[o + i] = Math.round(base[i] * (1 - wf) + 255 * wf);
      px[o + 3] = Math.round((fill / (S * S)) * 255);
    }
  }
  return png(size, px);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO com várias resoluções, cada uma como PNG embutido. */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const appImgs = sizes.map((size) => ({ size, data: render(size, palettes.app) }));
writeFileSync(`${OUT}/app.png`, appImgs.at(-1).data);
writeFileSync(`${OUT}/app.ico`, ico(appImgs));

for (const state of ['listening', 'paused', 'error', 'busy']) {
  writeFileSync(`${OUT}/tray-${state}.png`, render(16, palettes[state]));
  writeFileSync(`${OUT}/tray-${state}@2x.png`, render(32, palettes[state]));
}
console.log('Ícones gerados em', OUT);

// ---------- Android (se o projeto existir) ----------
const RES = 'android/app/src/main/res';
if (existsSync(RES)) {
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(densities)) {
    const dir = `${RES}/mipmap-${d}`;
    mkdirSync(dir, { recursive: true });
    // Ícone adaptativo: 108dp, desenho dentro da área segura central (~60%).
    writeFileSync(`${dir}/ic_launcher_foreground.png`, render(Math.round(108 * k), palettes.app, 0.6));
    // Ícones antigos (Android < 8): 48dp.
    writeFileSync(`${dir}/ic_launcher.png`, render(Math.round(48 * k), palettes.app, 0.92));
    writeFileSync(`${dir}/ic_launcher_round.png`, render(Math.round(48 * k), palettes.app, 0.92));
  }
  writeFileSync(
    `${RES}/values/ic_launcher_background.xml`,
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0A0A0F</color>\n</resources>\n',
  );
  console.log('Ícones do Android gerados em', RES);
}
