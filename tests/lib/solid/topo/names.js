/* SPDX-License-Identifier: Apache-2.0 */
/* i18n-ignore-file: cc-solid is a standalone library; its errors are codes (the app words them). */
/**
 * names.js — cc-solid (S11, docs/solid/HANDOFF.md § 8.6): persistent names. DOM-free; imports core/ only.
 *
 * A face, an edge or a vertex made by an operation gets a name that depends only on what made it: the operation, the names
 * of its inputs, and the role of the entity in the result (e.g. extrude, the profile edge's name, 'side'). Running the same
 * recipe again gives the same names, so references to "the top face" survive edits that keep the topology, and splits and
 * merges can record what they came from (derivedFrom) for a lookup to follow.
 *
 * The hash is FNV-1a in two independent 32-bit lanes (offset bases 0x811c9dc5 and 0x01000193 · 2654435761 mod 2^32, the same
 * prime), over the UTF-16 code units of the parts, each part closed by a separator no part can contain; 64 bits shown as 16
 * hexadecimal digits after 'n'. Not cryptographic: names are identities within one model, not secrets; with 64 bits a
 * collision among a million names has a chance of about 3e-8, and an operation that meets one refuses (S20 and later).
 *
 *   nameOf(op, inputs = [], role = '') → 'n' + 16 hex digits    op and role: strings; inputs: names or other strings
 *   isName(x) → true for a string of that form
 * Refusals: solid.err.bad_input { name: 'op' | 'inputs' | 'role', why: 'not_a_string' | 'not_an_array' }.
 */
import { fail } from '../core/errors.js';

const SEP = 0xffff;                                    // a code unit no part may hold (refused below)

function lanes(parts) {
  let h1 = 0x811c9dc5, h2 = Math.imul(0x01000193, 2654435761) >>> 0;
  const unit = (c) => {
    h1 ^= c & 0xff; h1 = Math.imul(h1, 0x01000193) >>> 0; h1 ^= c >>> 8; h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c >>> 8; h2 = Math.imul(h2, 0x01000193) >>> 0; h2 ^= c & 0xff; h2 = Math.imul(h2, 0x01000193) >>> 0;
  };
  for (const p of parts) { for (let i = 0; i < p.length; i++) unit(p.charCodeAt(i)); unit(SEP); }
  return [h1, h2];
}

const isText = (s) => typeof s === 'string' && s.length <= 4096 && !s.includes(String.fromCharCode(SEP));

export function nameOf(op, inputs = [], role = '') {
  if (!isText(op) || op.length === 0) fail('solid.err.bad_input', { name: 'op', why: 'not_a_string' });
  if (!Array.isArray(inputs) || inputs.length > 4096) fail('solid.err.bad_input', { name: 'inputs', why: 'not_an_array' });
  for (const x of inputs) if (!isText(x)) fail('solid.err.bad_input', { name: 'inputs', why: 'not_a_string' });
  if (!isText(role)) fail('solid.err.bad_input', { name: 'role', why: 'not_a_string' });
  const [h1, h2] = lanes([op, ...inputs, role]);         // each part closed by SEP: the list, so (op, inputs, role), decodes uniquely
  return 'n' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export const isName = (x) => typeof x === 'string' && /^n[0-9a-f]{16}$/.test(x);
