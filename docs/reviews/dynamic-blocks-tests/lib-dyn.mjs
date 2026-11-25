// helpers for poking at raw dynamic-block objects of a DWG with CadCraft's own bit reader (observation only)
import fs from 'node:fs';
const D = new URL('./dev/', import.meta.url).href;
const { readDwg } = await import(D + 'dwg/read.js');
const { BitReader } = await import(D + 'dwg/bits-read.js');
const { unb64 } = await import(D + 'dwg/bits-util.js');
const { stringStreamStart } = await import(D + 'dwg/objects-read.js');
export const hexKey = (h) => (h === undefined || h === null ? '' : String(h).toUpperCase().replace(/^0+(?=.)/, ''));
export function load(file) { const m = readDwg(new Uint8Array(fs.readFileSync(file))); const objs = new Map(m.objects.map(o => [hexKey(o.handle), o])); return { m, objs }; }
export function reader(raw) {
  const buf = unb64(raw.data);
  const r = new BitReader(buf, { version: raw.ver, endBit: raw.n });
  if (raw.ver >= 21) {
    const ss = stringStreamStart(buf, raw.n, 0);
    const s = new BitReader(buf, { version: raw.ver, startBit: raw.n, endBit: raw.n });
    if (ss !== -1) { s.pos = ss.start; s.end = ss.end; r.end = ss.start; } else r.end = raw.n - 1;
    r.str = s;
  }
  r.buf = buf; return r;
}
export { BitReader, unb64 };
