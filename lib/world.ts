export type Settings={seed:string;size:number;hilliness:number;trees:number;scale?:number;dynamic?:boolean;maxSize?:number;terrainMode?:'rolling';terrain?:World};
export type Cell={x:number;z:number;h:number;parent:number;dx:number;dz:number;ramp:boolean};
export type World={cells:Cell[];settings:Settings;root:number;originX:number;originZ:number;stats:{tiles:number;ramps:number;height:number;reachable:number}};
export const TILE=6, RISE=3, MAX_SIZE=128;
export function random(seed:string){let h=2166136261;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619);return()=>{h+=0x6D2B79F5;let t=Math.imul(h^h>>>15,1|h);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
export function generateWorld(settings:Settings,previous?:World):World{
 if(settings.terrainMode==='rolling')return generateRollingWorld(settings,previous);
 const n=settings.size;if(!Number.isInteger(n)||n<10||n>1024||n%2!==0)throw new Error('Map size must be an even number from 10–128 tiles.');
 const border=previous?(n-previous.settings.size)/2:0;
 if(previous&&(!Number.isInteger(border)||border<1))throw new Error('Expansion requires an even size increase.');
 const originX=previous?previous.originX-border:0,originZ=previous?previous.originZ-border:0;
 const rng=random(settings.seed+(previous?`/expand/${n}/${originX}/${originZ}`:'')),cells:Array<Cell|undefined>=new Array(n*n),order:number[]=[],dirs=[[1,0],[-1,0],[0,1],[0,-1]];
 const at=(x:number,z:number)=>x>=originX&&z>=originZ&&x<originX+n&&z<originZ+n?(z-originZ)*n+x-originX:-1;
 const neighbors=(i:number)=>dirs.map(([dx,dz])=>at(i%n+originX+dx,Math.floor(i/n)+originZ+dz)).filter(i=>i>=0);
 const add=(i:number,h:number,parent:number,ramp=false,dx=0,dz=0)=>{cells[i]={x:i%n+originX,z:Math.floor(i/n)+originZ,h,parent,ramp,dx,dz};order.push(i);};
 let root=Math.floor(n/2)*n+Math.floor(n/2);
 if(previous){for(const c of previous.cells){const p=previous.cells[c.parent];const i=at(c.x,c.z);cells[i]={...c,parent:p?at(p.x,p.z):-1};order.push(i);}const oldRoot=previous.cells[previous.root];root=at(oldRoot.x,oldRoot.z);}else add(root,0,-1);
 let current=root,frontier=0;
 // Only components adjacent to the newly occupied ramp can lose access.
 // Stop searching a component as soon as a flat neighbor is found.
 function fillable(rampIndex:number){for(const start of neighbors(rampIndex)){if(cells[start])continue;const seen=new Set([start]),queue=[start];let access=false;for(let q=0;q<queue.length&&!access;q++){for(const j of neighbors(queue[q])){if(cells[j]){if(!cells[j]!.ramp){access=true;break;}}else if(!seen.has(j)){seen.add(j);queue.push(j);}}}if(!access)return false;}return true;}
 while(order.length<n*n){const free=neighbors(current).filter(i=>!cells[i]);if(!free.length){while(frontier<order.length&&(cells[order[frontier]]!.ramp||!neighbors(order[frontier]).some(j=>!cells[j])))frontier++;if(frontier===order.length)throw new Error('Generation lost its frontier');current=order[frontier];continue;}
 const to=free[Math.floor(rng()*free.length)],c=cells[current]!,x=to%n+originX,z=Math.floor(to/n)+originZ,dx=x-c.x,dz=z-c.z,landing=at(x+dx,z+dz);
 if(rng()<settings.hilliness/2&&landing>=0&&!cells[landing]){cells[to]={x,z,h:c.h,parent:current,ramp:true,dx,dz};cells[landing]={x:x+dx,z:z+dz,h:c.h+1,parent:to,ramp:false,dx:0,dz:0};if(fillable(to)){order.push(to,landing);current=landing;continue;}cells[to]=undefined;cells[landing]=undefined;}
 add(to,c.h,current);current=to;
 }
 const full=cells as Cell[];const reached=new Set([root]),queue=[root];for(let k=0;k<queue.length;k++)for(const j of neighbors(queue[k])){if(reached.has(j))continue;const a=full[queue[k]],b=full[j],mx=(a.x+b.x+1)*TILE/2,mz=(a.z+b.z+1)*TILE/2;if(Math.abs(cellHeight(a,mx,mz)-cellHeight(b,mx,mz))<.001){reached.add(j);queue.push(j);}}
 return{cells:full,settings,root,originX,originZ,stats:{tiles:n*n,ramps:full.filter(c=>c.ramp).length,height:full.reduce((h,c)=>Math.max(h,c.h+Number(c.ramp)),0),reachable:reached.size}};
}
export function growWorld(w:World){return w.settings.size>=MAX_SIZE?w:generateWorld({...w.settings,size:Math.min(MAX_SIZE,w.settings.size+16)},w);}
export function cellHeight(c:Cell,x:number,z:number){return RISE*(c.h+(c.ramp?Math.max(0,Math.min(1,.5+c.dx*(x/TILE-c.x-.5)+c.dz*(z/TILE-c.z-.5))):0));}
export function heightAt(w:World,x:number,z:number){const n=w.settings.size,ix=Math.floor(x/TILE)-w.originX,iz=Math.floor(z/TILE)-w.originZ;if(ix<0||iz<0||ix>=n||iz>=n)return null;const c=w.cells[iz*n+ix];return c?cellHeight(c,x,z):null;}



// Coordinate noise is independent of generation order and the explored map bounds.
export function rollingElevation(seed:string,x:number,z:number){
 const hash=(a:number,b:number)=>{let h=2166136261;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619);h=Math.imul(h^a,374761393);h=Math.imul(h^b,668265263);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295;};
 const smooth=(t:number)=>t*t*t*(t*(t*6-15)+10);
 const noise=(size:number)=>{const px=x/size,pz=z/size,ix=Math.floor(px),iz=Math.floor(pz),u=smooth(px-ix),v=smooth(pz-iz);return(hash(ix,iz)*(1-u)+hash(ix+1,iz)*u)*(1-v)+(hash(ix,iz+1)*(1-u)+hash(ix+1,iz+1)*u)*v;};
 return .5+noise(24)*3+noise(9)*.7+noise(3)*.12;
}
function generateRollingWorld(settings:Settings,previous?:World):World{
 const n=settings.size;if(!Number.isSafeInteger(n)||n<10||n%2)throw Error('Invalid generated region size');
 const border=previous?(n-previous.settings.size)/2:0,originX=previous?previous.originX-border:0,originZ=previous?previous.originZ-border:0;
 const midX=originX+(n-1)/2,midZ=originZ+(n-1)/2,cells:Cell[]=[],old=new Map(previous?.cells.map(c=>[c.x+','+c.z,c]));
 for(let z=originZ;z<originZ+n;z++)for(let x=originX;x<originX+n;x++){const kept=old.get(x+','+z);cells.push(kept?{...kept,parent:-1}:{x,z,h:rollingElevation(settings.seed,x-midX,z-midZ),parent:-1,ramp:false,dx:0,dz:0});}
 return {cells,settings,originX,originZ,root:Math.floor(n/2)*n+Math.floor(n/2),stats:{tiles:n*n,ramps:0,height:Math.max(...cells.slice(0,10000).map(c=>c.h)),reachable:n*n}};
}
