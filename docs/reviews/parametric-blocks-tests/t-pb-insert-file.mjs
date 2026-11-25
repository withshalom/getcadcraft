const D = new URL('./dev/', import.meta.url).href;
const { readDxf } = await import(D + 'dxf.js'); const { writeDxf2000 } = await import(D + 'dxf2000.js');
const { Doc } = await import(D + 'doc.js'); const LP = await import(D + 'libplace.js');
const fs = await import('node:fs'); const items = JSON.parse(fs.readFileSync(new URL('./dev/paramblocks/starter.json', import.meta.url))).items;
const doc = new Doc(); doc.meta.units='millimeters'; let n; doc.change('p',()=>{n=LP.ensureLibraryBlock(doc, items[0]).name;});
const src = readDxf(writeDxf2000(doc).text);
console.log(Object.keys(src), src.blocks instanceof Map ? 'map' : typeof src.blocks);
const b = src.blocks.get ? src.blocks.get(n) : src.blocks[n]; console.log(n, b && Object.keys(b), !!(b&&b.bp));
