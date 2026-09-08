export type Settings={seed:string;size:number;hilliness:number;trees:number};
export type Cell={x:number;z:number;h:number;parent:number;dx:number;dz:number;ramp:boolean};
export type World={cells:Cell[];settings:Settings;root:number;stats:{tiles:number;ramps:number;height:number;reachable:number}};
export const TILE=6, RISE=3;
export function random(seed:string){let h=2166136261;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619);return()=>{h+=0x6D2B79F5;let t=Math.imul(h^h>>>15,1|h);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
export function generateWorld(settings:Settings):World{
 const n=settings.size,rng=random(settings.seed),cells:Array<Cell|undefined>=new Array(n*n),order:number[]=[],dirs=[[1,0],[-1,0],[0,1],[0,-1]];
 const at=(x:number,z:number)=>x>=0&&z>=0&&x<n&&z<n?z*n+x:-1;
 const neighbors=(i:number)=>dirs.map(([dx,dz])=>at(i%n+dx,Math.floor(i/n)+dz)).filter(i=>i>=0);
 const add=(i:number,h:number,parent:number,ramp=false,dx=0,dz=0)=>{cells[i]={x:i%n,z:Math.floor(i/n),h,parent,ramp,dx,dz};order.push(i);};
 const root=Math.floor(n/2)*n+Math.floor(n/2);add(root,0,-1);let current=root;
 function fillable(){const seen=new Set<number>();for(let i=0;i<n*n;i++){if(cells[i]||seen.has(i))continue;const queue=[i];seen.add(i);let access=false;for(let q=0;q<queue.length;q++)for(const j of neighbors(queue[q])){if(cells[j]){if(!cells[j]!.ramp)access=true;}else if(!seen.has(j)){seen.add(j);queue.push(j);}}if(!access)return false;}return true;}
 while(order.length<n*n){const free=neighbors(current).filter(i=>!cells[i]);if(!free.length){const next=order.find(i=>!cells[i]!.ramp&&neighbors(i).some(j=>!cells[j]));if(next===undefined)throw new Error('Generation lost its frontier');current=next;continue;}
 const to=free[Math.floor(rng()*free.length)],c=cells[current]!,dx=to%n-c.x,dz=Math.floor(to/n)-c.z,landing=at(to%n+dx,Math.floor(to/n)+dz);
 if(rng()<settings.hilliness/2&&landing>=0&&!cells[landing]){cells[to]={x:to%n,z:Math.floor(to/n),h:c.h,parent:current,ramp:true,dx,dz};cells[landing]={x:landing%n,z:Math.floor(landing/n),h:c.h+1,parent:to,ramp:false,dx:0,dz:0};if(fillable()){order.push(to,landing);current=landing;continue;}cells[to]=undefined;cells[landing]=undefined;}
 add(to,c.h,current);current=to;
 }
 const full=cells as Cell[];const reached=new Set([root]),queue=[root];for(let k=0;k<queue.length;k++)for(const j of neighbors(queue[k])){if(reached.has(j))continue;const a=full[queue[k]],b=full[j],mx=(a.x+b.x+1)*TILE/2,mz=(a.z+b.z+1)*TILE/2;if(Math.abs(cellHeight(a,mx,mz)-cellHeight(b,mx,mz))<.001){reached.add(j);queue.push(j);}}
 return{cells:full,settings,root,stats:{tiles:n*n,ramps:full.filter(c=>c.ramp).length,height:Math.max(...full.map(c=>c.h+Number(c.ramp))),reachable:reached.size}};
}
export function cellHeight(c:Cell,x:number,z:number){return RISE*(c.h+(c.ramp?Math.max(0,Math.min(1,.5+c.dx*(x/TILE-c.x-.5)+c.dz*(z/TILE-c.z-.5))):0));}
export function heightAt(w:World,x:number,z:number){const n=w.settings.size,c=w.cells[Math.floor(z/TILE)*n+Math.floor(x/TILE)];if(x<0||z<0||x>=n*TILE||z>=n*TILE||!c)return null;return cellHeight(c,x,z);}
