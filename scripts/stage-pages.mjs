import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
await fs.mkdir('_site',{recursive:true});
await fs.copyFile('playable/last-bastion-world-lab.html','_site/index.html');
// Remove superseded immutable assets when rebuilding an existing local Pages directory.
const publishedAssets = new Set(await fs.readdir('public/creatures'));
for (const name of await fs.readdir('_site/creatures').catch(() => []))
  if (/^asset_[a-f0-9]{24}\.(glb|png)$/.test(name) && !publishedAssets.has(name))
    await fs.unlink('_site/creatures/' + name);
await fs.cp('public/creatures','_site/creatures',{recursive:true});
await fs.writeFile('_site/.nojekyll','');
await fs.writeFile('_site/directory.json',JSON.stringify({links:[{label:'Play Last Bastion',url:'./',primary:true}]},null,2)+'\n');
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
await fs.writeFile('_site/build.json',JSON.stringify({source:'https://github.com/jchoxha/last-bastion',commit},null,2)+'\n');
console.log('GitHub Pages artifact ready in _site');
