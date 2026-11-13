/* SPDX-License-Identifier: Apache-2.0 */
window.alert('x'); // expect: global
const r = fetch('/x'); // expect: global
const e = process.env; // expect: global
globalThis.document.title = 'x'; // expect: global
globalThis['fetch'](); // expect: global
setTimeout(() => 0, 1); // expect: global
console.log(1); // expect: global
const w = WebAssembly; // expect: global
const t = performance.now(); // expect: global
const s = self; // solid-allow: global (fixture: a forbidden global a comment explains)
export const glob = [r, e, w, t, s];
