import fs from 'node:fs'; import { run } from './bh-dyn.mjs';
console.log(JSON.stringify(await run(JSON.parse(fs.readFileSync(new URL('./front-block.json', import.meta.url), 'utf8')), new URL('./dev/', import.meta.url).href)));
