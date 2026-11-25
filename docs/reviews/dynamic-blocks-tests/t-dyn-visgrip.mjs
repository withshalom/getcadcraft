// The visibility list grip on a formula-driven visibility parameter (PB.1 gap G9), and the size-table list grip the translation uses instead.
import { buildFront } from './poc-front-pb.mjs';
const D = new URL('./dev/', import.meta.url).href;
const BP = await import(D + 'blockparams.js');
const say = (ok, m, x = '') => console.log((ok ? 'PASS ' : 'FAIL ') + m + (x ? '  — ' + x : ''));
const F = await buildFront(process.argv[2] || './front.dwg');
const e = { type: 'insert', layer: '0', block: F.name, x: 0, y: 0, sx: 1, sy: 1, rot: 0 };
const keysOfState = (i) => new Set(F.states[i].shown.flatMap((h) => F.keysOf.get(h) || []));
const same = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));

// the flip grip
const rf = BP.refFlip(null, F.blk.bp, 'Flip');
say(rf.ok && BP.resolveBp(F.blk.bp, rf.bp).values.get('Flip') === 1, 'the flip grip (refFlip) switches Flip to 1', JSON.stringify(rf.bp?.vals));

// A. a list grip on the visibility parameter itself, while the parameter's state comes from the formula State
{
  const raw = JSON.parse(JSON.stringify(F.blk.bp));
  raw.grips = raw.grips.map((g) => (g.t === 'list' ? { t: 'list', name: 'Visibility', vis: 'Visibility', x: g.x, y: g.y } : g));
  delete raw.tables;
  const bp = BP.cleanBp(raw), blk = { ...F.blk, bp };
  const g = BP.refGrips(blk, e).find((x) => x.kind === 'list'), ch = BP.refChoices(bp, null, g), pick = ch.rows[3].pick();
  const shown = new Set(BP.bpParts(blk, pick.bp).map((x) => x.bpk));
  say(pick.ok && same(shown, keysOfState(3)), 'PB.1 G9: picking "0 Front Klapowy (+luzy)" from the visibility parameter\'s own list grip shows the flap state',
    `the list offers ${ch.rows.length} states, the pick is accepted (ok ${pick.ok}, stored ${JSON.stringify(pick.bp)}), but the front still shows state ${same(shown, keysOfState(0)) ? 1 : '?'}: the formula State wins`);
}

// B. the translation's way: a size table "Front type" (rows = the 8 state names, each setting State), opened by the list grip
{
  const g = BP.refGrips(F.blk, e).find((x) => x.kind === 'list'), ch = BP.refChoices(F.blk.bp, null, g), pick = ch.rows[3].pick();
  const shown = new Set(BP.bpParts(F.blk, pick.bp).map((x) => x.bpk));
  say(pick.ok && same(shown, keysOfState(3)), 'with the size table "Front type", the list grip picks the flap state by name', `rows ${ch.rows.length}, picked ${JSON.stringify(pick.bp?.vals)}`);
}
