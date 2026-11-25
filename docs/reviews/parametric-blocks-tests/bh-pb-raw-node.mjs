import fs from 'node:fs'; import { run } from './bh-pb2.mjs';
console.log(JSON.stringify(await run(fs.readFileSync(new URL('./dev/paramblocks/starter.json', import.meta.url), 'utf8'))));
