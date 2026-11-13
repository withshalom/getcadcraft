/* SPDX-License-Identifier: Apache-2.0 */
// Comments may mention window, document, fetch(url), process.env, eval, Date.now(), Math.random() and 1e-9 freely.
/* A block comment too: setTimeout(f, 1e-12); require('fs'); import x from "y" */
export const words = ['window', "fetch(x)", 'process', "document.title", 'Math.random()'];
export const keys = { window: 1, document: 2, fetch: 3, process: 4 };
export const nested = `a ${keys.window + `b ${'document'} ${{ x: 1 }.x}`} c ${words.length / 2}`;
export const re = /['"`]\/\/(?:window|fetch)[/{}]/g;
export const ratio = (keys.window) / 2 / (keys.fetch);
export const tests = (/ab+c/).test('abbc') && words[0].length / 3;
export const numbers = [1e3, 0.5, 1_000, 0x1f, 0o17, 0b1011, 2n, 0.001, 10, 1.5e2];
export const member = { o: { process: 1, window: 2 } }.o.process;
export class Tool { #fetch = 1; #document = 2; get both() { return this.#fetch + this.#document; } }
export const tpl = `${`deep ${`deeper ${1 + 1}`}`}`;
export const division = numbers[1] / numbers[0] / 2;
export function regexAfterReturn(s) { return /x\/y/.test(s); }
let n = 1;
n++ / 2;
export const optional = keys?.window ?? 0;
