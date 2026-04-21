const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const MOBILE_ROOT = path.resolve(ROOT, '..', 'mobile');
const SIZE = 1024;

const colors = {
  canvas: '#f5ede1',
  navBg: '#2f566f',
  accent: '#b65931',
  accentText: '#f8f4e8',
  warm: '#d9905c'
};

function hexToRgba(hex, alpha = 255) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
    a: alpha
  };
}

function makeCanvas(width, height, color = { r: 0, g: 0, b: 0, a: 0 }) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    data[idx] = color.r;
    data[idx + 1] = color.g;
    data[idx + 2] = color.b;
    data[idx + 3] = color.a;
  }
  return { width, height, data };
}

function setPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const idx = (y * canvas.width + x) * 4;
  canvas.data[idx] = color.r;
  canvas.data[idx + 1] = color.g;
  canvas.data[idx + 2] = color.b;
  canvas.data[idx + 3] = color.a;
}

function fillCircle(canvas, cx, cy, radius, color) {
  const r2 = radius * radius;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(canvas.width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(canvas.height - 1, Math.ceil(cy + radius));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        setPixel(canvas, x, y, color);
      }
    }
  }
}

function fillRing(canvas, cx, cy, outerRadius, innerRadius, color) {
  const outer2 = outerRadius * outerRadius;
  const inner2 = innerRadius * innerRadius;
  const minX = Math.max(0, Math.floor(cx - outerRadius));
  const maxX = Math.min(canvas.width - 1, Math.ceil(cx + outerRadius));
  const minY = Math.max(0, Math.floor(cy - outerRadius));
  const maxY = Math.min(canvas.height - 1, Math.ceil(cy + outerRadius));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const dist2 = dx * dx + dy * dy;
      if (dist2 <= outer2 && dist2 >= inner2) {
        setPixel(canvas, x, y, color);
      }
    }
  }
}

function fillRoundedRect(canvas, x, y, w, h, radius, color) {
  const r = Math.min(radius, w / 2, h / 2);
  const x2 = x + w;
  const y2 = y + h;
  for (let py = Math.max(0, Math.floor(y)); py < Math.min(canvas.height, Math.ceil(y2)); py += 1) {
    for (let px = Math.max(0, Math.floor(x)); px < Math.min(canvas.width, Math.ceil(x2)); px += 1) {
      let inside = false;
      if (px >= x + r && px < x2 - r) inside = true;
      if (py >= y + r && py < y2 - r) inside = true;
      const corners = [
        [x + r, y + r],
        [x2 - r, y + r],
        [x + r, y2 - r],
        [x2 - r, y2 - r]
      ];
      for (const [cx, cy] of corners) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy <= r * r) {
          inside = true;
          break;
        }
      }
      if (inside) setPixel(canvas, px, py, color);
    }
  }
}

function distanceToSegmentSquared(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    const ddx = px - x1;
    const ddy = py - y1;
    return ddx * ddx + ddy * ddy;
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const lx = x1 + t * dx;
  const ly = y1 + t * dy;
  const ddx = px - lx;
  const ddy = py - ly;
  return ddx * ddx + ddy * ddy;
}

function fillCapsule(canvas, x1, y1, x2, y2, radius, color) {
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - radius));
  const maxX = Math.min(canvas.width - 1, Math.ceil(Math.max(x1, x2) + radius));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - radius));
  const maxY = Math.min(canvas.height - 1, Math.ceil(Math.max(y1, y2) + radius));
  const r2 = radius * radius;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (distanceToSegmentSquared(x, y, x1, y1, x2, y2) <= r2) {
        setPixel(canvas, x, y, color);
      }
    }
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  const crcVal = crc32(Buffer.concat([name, data]));
  crc.writeUInt32BE(crcVal >>> 0, 0);
  return Buffer.concat([len, name, data, crc]);
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function writePng(filePath, canvas) {
  const rows = [];
  for (let y = 0; y < canvas.height; y += 1) {
    const start = y * canvas.width * 4;
    const row = canvas.data.subarray(start, start + canvas.width * 4);
    rows.push(Buffer.concat([Buffer.from([0]), row]));
  }
  const raw = Buffer.concat(rows);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvas.width, 0);
  ihdr.writeUInt32BE(canvas.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, png);
}

function buildFullIcon() {
  const canvas = makeCanvas(SIZE, SIZE, hexToRgba(colors.canvas));
  fillRoundedRect(canvas, 140, 140, 744, 744, 170, hexToRgba(colors.navBg));
  fillRing(canvas, 470, 470, 205, 115, hexToRgba(colors.accentText));
  fillCapsule(canvas, 595, 595, 735, 735, 36, hexToRgba(colors.accent));
  fillCircle(canvas, 740, 270, 58, hexToRgba(colors.warm));
  return canvas;
}

function buildAdaptiveIcon() {
  const canvas = makeCanvas(SIZE, SIZE, { r: 0, g: 0, b: 0, a: 0 });
  fillRing(canvas, 470, 470, 205, 115, hexToRgba(colors.navBg));
  fillCapsule(canvas, 595, 595, 735, 735, 36, hexToRgba(colors.accent));
  fillCircle(canvas, 740, 270, 58, hexToRgba(colors.warm));
  return canvas;
}

function writeSet(baseDir) {
  const assetsDir = path.join(baseDir, 'assets');
  writePng(path.join(assetsDir, 'icon.png'), buildFullIcon());
  writePng(path.join(assetsDir, 'adaptive-icon.png'), buildAdaptiveIcon());
  writePng(path.join(assetsDir, 'favicon.png'), buildFullIcon());
}

writeSet(ROOT);
writeSet(MOBILE_ROOT);
console.log('Qbit brand assets generated successfully.');