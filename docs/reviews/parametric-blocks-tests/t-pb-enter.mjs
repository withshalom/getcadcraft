// Enter at a prompt that shows a default, in BPARAMS / PBLOCK / PBEXPORT, through the real command engine
const D = new URL('./dev/', import.meta.url).href;
const { Doc } = await import(D + 'doc.js'); const { Engine } = await import(D + 'commands.js');
await import(D + 'blockparams-cmd.js'); await import(D + 'paramblock-cmd.js');
function harness() {
  const doc = new Doc(); doc.meta.units = 'millimeters'; const log = [], saved = [];
  const host = { cursor: { x: 0, y: 0 }, selection: new Set(), print: (s) => log.push(String(s)), prompt: (s) => { host.lastPrompt = s; log.push('PROMPT ' + s); }, setSelection: () => {}, preview: () => {}, pickAt: () => null, pickWindow: () => [], zoomExtents: () => {}, zoomWindow: () => {}, saveBlob: (n, t) => saved.push({ n, t }) };
  const eng = new Engine(doc, host); const tick = () => new Promise((r) => setTimeout(r, 0));
  const type = async (...ls) => { for (const l of ls) { eng.text(l); await tick(); await tick(); } };
  doc.change('s', () => doc.defineBlock({ name: 'PL', base: { x: 0, y: 0 }, entities: [{ type: 'poly', layer: '0', pts: [{ x: 0, y: 0, b: 0 }, { x: 100, y: 0, b: 0 }, { x: 100, y: 50, b: 0 }, { x: 0, y: 50, b: 0 }], closed: true }], bp: { params: [{ name: 'W', expr: '100', kind: 'length' }], vis: [] } }));
  return { doc, eng, log, saved, type };
}
const say = (label, ok, detail) => console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  — ' + detail : ''));
{ // PBLOCK stretch, Enter at "dy <0>"
  const H = harness();
  await H.type('PBLOCK', 'PL', 'S', '90,-10', '110,60', 'W - 100', '', 'D');
  const acts = H.doc.blocks.get('PL').bp.acts || [];
  const prompts = H.log.filter((l) => l.startsWith('PROMPT')).slice(-4).map((l) => l.slice(7)).join(' | ');
  say('PBLOCK Stretch: Enter at the dy prompt (default 0) makes the stretch', acts.length === 1 && acts[0].dy === '0', 'actions: ' + JSON.stringify(acts) + ' | messages: ' + H.log.filter((l) => !l.startsWith('PROMPT')).slice(-3).join(' / ') + ' | prompts: ' + prompts);
}
{ // PBLOCK move, Enter at both dx and dy
  const H = harness();
  await H.type('PBLOCK', 'PL', 'M', '', '', 'D');
  const acts = H.doc.blocks.get('PL').bp.acts || [];
  say('PBLOCK Move: Enter at dx and dy (defaults 0) makes a move', acts.length === 1, 'actions: ' + JSON.stringify(acts) + ' | ' + H.log.filter((l) => !l.startsWith('PROMPT')).slice(-2).join(' / '));
}
{ // PBEXPORT, Enter at every prompt that shows a default
  const H = harness();
  H.doc.change('a', () => H.doc.defineBlock({ ...H.doc.blocks.get('PL'), bp: { params: [{ name: 'W', expr: '100', kind: 'length' }], vis: [], acts: [{ t: 'move', dx: 'W - 100', dy: '0' }] } }));
  await H.type('PBEXPORT', 'PL', '', '', '', '', '');
  say('PBEXPORT: Enter at name, kind <symbol>, category <symbols/annotation>, description writes the file', H.saved.length === 1, 'messages: ' + H.log.filter((l) => !l.startsWith('PROMPT')).slice(-2).join(' / ') + ' | prompts: ' + H.log.filter((l) => l.startsWith('PROMPT')).map((l) => l.slice(7)).join(' | '));
  const H2 = harness();
  H2.doc.change('a', () => H2.doc.defineBlock({ ...H2.doc.blocks.get('PL'), bp: { params: [{ name: 'W', expr: '100', kind: 'length' }], vis: [], acts: [{ t: 'move', dx: 'W - 100', dy: '0' }] } }));
  await H2.type('PBEXPORT', 'PL', '', 'symbol', 'symbols/annotation', '', '');
  say('PBEXPORT: the same, with kind and category typed out', H2.saved.length === 1, H2.log.filter((l) => !l.startsWith('PROMPT')).slice(-1).join(''));
}
