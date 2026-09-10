/**
 * Minimal dependency-free PNG encoder (RGBA, 8-bit, non-interlaced).
 *
 * The Node standard library already ships a DEFLATE implementation
 * (`zlib`), and the PNG container is only a handful of chunks with a
 * CRC32 table — so the whole encoder fits in ~90 lines without pulling
 * an image dependency into a React Native project.
 */

import { deflateSync } from 'node:zlib';

/** RGBA raster: `width × height`, 4 bytes per pixel. */
export interface Raster {
  readonly width: number;
  readonly height: number;
  /** Length MUST be `width * height * 4` (RGBA, row-major). */
  readonly data: Uint8Array;
}

// ---------------------------------------------------------------------------
// CRC32 (PNG requirement)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Chunk helpers
// ---------------------------------------------------------------------------

/** PNG chunk = [4-byte length][4-byte type][payload][4-byte CRC]. */
function chunk(type: string, payload: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(payload.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, payload])), 0);
  return Buffer.concat([len, typeBuf, Buffer.from(payload), crcBuf]);
}

// ---------------------------------------------------------------------------
// Encoder
// ---------------------------------------------------------------------------

/**
 * Encode an RGBA raster as a PNG file buffer.
 *
 * @throws if `data.length !== width * height * 4`.
 */
export function encodePng(raster: Raster): Buffer {
  const { width, height, data } = raster;
  const expected = width * height * 4;
  if (data.length !== expected) {
    throw new Error(
      `encodePng: data length ${data.length} != ${width}×${height}×4 (${expected})`,
    );
  }
  if (width <= 0 || height <= 0 || width > 0xffff || height > 0xffff) {
    throw new Error(`encodePng: unsupported dimensions ${width}×${height}`);
  }

  // IHDR: width, height, bit depth 8, color type 6 (RGBA),
  // compression 0, filter 0, interlace 0.
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Raw scanlines: each row prefixed with filter byte 0 (None).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // signature
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Convert ASCII pixel grids into an RGBA raster using a char legend.
 *
 * Each row string must be exactly `width` characters. Rows shorter than
 * `width` are right-padded with transparency; extra rows beyond
 * `height` are an error (authoring typo guard).
 */
export function rasterFromRows(
  rows: readonly string[],
  legend: (ch: string) => [number, number, number, number],
  width: number,
  height: number,
): Raster {
  if (rows.length !== height) {
    throw new Error(
      `rasterFromRows: expected ${height} rows, got ${rows.length}`,
    );
  }
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    if (row.length > width) {
      throw new Error(
        `rasterFromRows: row ${y} is ${row.length} chars (max ${width}): "${row}"`,
      );
    }
    for (let x = 0; x < width; x++) {
      const rgba = legend(row[x] ?? '.');
      const i = (y * width + x) * 4;
      data[i] = rgba[0];
      data[i + 1] = rgba[1];
      data[i + 2] = rgba[2];
      data[i + 3] = rgba[3];
    }
  }
  return { width, height, data };
}
