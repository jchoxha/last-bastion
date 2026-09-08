import {build} from 'rolldown';
import fs from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
const root=process.cwd();
await fs.mkdir('work',{recursive:true});
await fs.mkdir('../outputs',{recursive:true});
await build({input:'scripts/standalone.tsx',platform:'browser',resolve:{alias:{'@':root}},output:{file:'work/standalone.js',format:'iife',minify:true},onwarn(w){if(w.code!=='MODULE_LEVEL_DIRECTIVE')console.warn(w.message);}});
const source=await fs.readFile('app/globals.css','utf8');
const css=await postcss([tailwind()]).process(source,{from:path.join(root,'app/globals.css')});
const js=(await fs.readFile('work/standalone.js','utf8')).replaceAll('</script','<\\/script');
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bonk World Lab</title><style>${css.css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;
await fs.writeFile('../outputs/bonk-world-lab.html',html);
console.log('Standalone build ready: '+Math.round(html.length/1024)+' KB');


