import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// Stage the current playable build in a local clone of the public directory site.
// Review and push that repository to publish; no credentials or cross-repo secrets needed.
const destination=path.resolve(process.argv[2] || '../github-pages');
const remote=execFileSync('git',['-C',destination,'remote','get-url','origin'],{encoding:'utf8'}).trim();
if(!/^https:\/\/github\.com\/jchoxha\/jchoxha\.github\.io(?:\.git)?$/.test(remote) && remote!=='git@github.com:jchoxha/jchoxha.github.io.git')throw Error('Destination must be the jchoxha.github.io repository.');
const output=path.join(destination,'last-bastion');
await fs.mkdir(output,{recursive:true});
await fs.copyFile('playable/last-bastion-world-lab.html',path.join(output,'index.html'));
await fs.writeFile(path.join(output,'directory.json'),JSON.stringify({links:[{label:'Play Last Bastion',url:'./',primary:true}]},null,2)+'\n');
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
await fs.writeFile(path.join(output,'build.json'),JSON.stringify({source:'https://github.com/jchoxha/last-bastion',commit},null,2)+'\n');
console.log('Staged playable build in '+output+'. Review, commit and push the site repository to publish.');
