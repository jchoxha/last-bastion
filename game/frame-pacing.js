/* Bound recurring exploration and AI work; retain finished geometry while jobs run. */
const frameClock=()=>typeof performance==='undefined'?Date.now():performance.now();
function disposeTerrain(mesh){if(!mesh)return;G.world.remove(mesh);mesh.traverse(o=>{o.geometry?.dispose();if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());});}
const buildPlateauPatch=buildTerrainMesh;
function makeTerrainRoot(){const root=new THREE.Mesh(new THREE.BufferGeometry(),[]);root.userData.chunks=new Map();G.world.add(root);G.terrain=root;return root;}
function plateauChunk(root,x,z){const prior=G.terrain;G.terrainBuildBounds=[x*4+WORLD/2,x*4+WORLD/2+3,z*4+WORLD/2,z*4+WORLD/2+3];let mesh;try{mesh=buildPlateauPatch();}finally{delete G.terrainBuildBounds;G.terrain=prior;}root.add(mesh);root.userData.chunks.set(x+','+z,mesh);}
function wantedTerrainChunks(){const [cx,cz]=worldToCell(G.player?.pos||V3()),x=cx-WORLD/2,z=cz-WORLD/2,result=[];for(let a=Math.floor((x-17)/4);a<=Math.floor((x+17)/4);a++)for(let b=Math.floor((z-17)/4);b<=Math.floor((z+17)/4);b++){if(a*4+WORLD/2+3<0||b*4+WORLD/2+3<0||a*4+WORLD/2>=WORLD||b*4+WORLD/2>=WORLD)continue;result.push([a,b]);}return result.sort((a,b)=>Math.hypot(a[0]*4-x,a[1]*4-z)-Math.hypot(b[0]*4-x,b[1]*4-z));}
buildTerrainMesh=function(){if(!plateauMode())return buildPlateauPatch();const root=makeTerrainRoot();for(const [x,z]of wantedTerrainChunks())plateauChunk(root,x,z);G.groundCenter=(G.player?.pos||V3()).clone();return root;};
function streamPlateauTerrain(){if(!G.terrain?.userData.chunks){disposeTerrain(G.terrain);buildTerrainMesh();return;}if(G.groundCenter&&G.groundCenter.distanceTo(G.player.pos)<CELL*2&&!G.terrainQueue?.length)return;const root=G.terrain,wanted=wantedTerrainChunks(),keys=new Set(wanted.map(c=>c.join(',')));G.terrainQueue=wanted.filter(c=>!root.userData.chunks.has(c.join(',')));const start=frameClock();while(G.terrainQueue.length){const [x,z]=G.terrainQueue.shift();plateauChunk(root,x,z);if(frameClock()-start>=2)break;}if(!G.terrainQueue.length){for(const [key,mesh]of root.userData.chunks)if(!keys.has(key)){root.remove(mesh);disposeTerrain(mesh);root.userData.chunks.delete(key);}G.groundCenter=G.player.pos.clone();}}
function streamFoliage(){if(!G.foliageJob&&(!G.foliageCenter||G.foliageCenter.distanceTo(G.player.pos)>20)){G.foliageJob=foliageJob();G.foliageJobStart=G.player.pos.clone();}if(!G.foliageJob)return;const start=frameClock();do{if(G.foliageJob.next().done){G.foliageJob=null;break;}}while(frameClock()-start<1);}
// Rebuilds requested by construction must dispose child chunks too.
redrawTerrain=function(){disposeTerrain(G.terrain);buildTerrainMesh();rebuildCollision();if(G.site)refreshRoutes();};

const immediateGridPlan=gridPlan;
let waitingResident=null;const pendingResidents=new WeakMap();
let deferredNavigation=0,routeJobs=new Map(),routeOwner=null,routeRevision=-1;
function resetRouteJobs(){if(routeOwner!==G||routeRevision!==navRevision){routeJobs.clear();routeOwner=G;routeRevision=navRevision;}}
gridPlan=function(from,to,r=.45){if(!deferredNavigation)return immediateGridPlan(from,to,r);resetRouteJobs();const key=[G.site?.id||0,...worldToCell(from),Math.round(from.x*2),Math.round(from.z*2),Math.round(to.x*2),Math.round(to.z*2),r].join('/');let job=routeJobs.get(key);if(!job){if(routeJobs.size>=192){const finished=[...routeJobs].find(([,j])=>j.done);if(finished)routeJobs.delete(finished[0]);else return null;}job={steps:gridPlanSteps(from.clone(),to.clone(),r),done:false,value:null,site:G.site};routeJobs.set(key,job);}if(waitingResident&&!job.done){pendingResidents.set(waitingResident,job);(job.waiters??=new Set()).add(waitingResident);}return job.done&&job.value?{cells:job.value.cells,path:job.value.path.map(p=>p.clone())}:null;};
let routeCursor=0;
function advanceRouteJobs(budget=2){
 resetRouteJobs();const start=frameClock(),ready=[...routeJobs.values()].filter(job=>!job.done);let unfinished=ready.length;
 while(unfinished){const job=ready[routeCursor++%ready.length];if(job.done)continue;
  for(let quantum=0;quantum<8;quantum++){
   const site=G.site;let step;try{G.site=job.site;step=job.steps.next();}finally{G.site=site;}
   if(step.done){job.done=true;job.value=step.value;job.steps=null;unfinished--;for(const w of job.waiters||[]){w.retry=0;w.stalled=0;}job.waiters=null;break;}
   if(frameClock()-start>=budget)return;
  }
  if(frameClock()-start>=budget)return;
 }
}

const pacedWorkers=updateWorkers;updateWorkers=function(...args){deferredNavigation++;try{return pacedWorkers(...args);}finally{deferredNavigation--;pumpNavigation();}};
const pacedEnemies=updateEnemies;updateEnemies=function(...args){deferredNavigation++;try{return pacedEnemies(...args);}finally{deferredNavigation--;pumpNavigation();}};
const pacedPlayer=updatePlayer;updatePlayer=function(dt){pacedPlayer(dt);pumpNavigation();};
// Runtime-only caches/generators are not save data.
const pacingPack=pack;pack=function(value){if(value&&typeof value==='object'&&!Array.isArray(value)&&!value.isVector3){const clean={...value};for(const key of ['segmentCheck','seenTarget','climbing'])delete clean[key];return pacingPack(clean);}return pacingPack(value);};
// Extend cell storage without serializing/reloading actors, settlements or meshes.
let streamingFrame=false;
const reloadExpansion=expandTerrain;
function* expansionSteps(){const owner=G,old=WORLD,next=old+16,offset=8,previous={settings:{...RUN_SETTINGS,size:old},originX:0,originZ:0,root:0,cells:[],stats:{}};
 for(let z=0;z<old;z++){for(let x=0;x<old;x++){const c=G.cells[x][z];previous.cells.push({x,z,h:c.lvl,parent:-1,ramp:!!c.ramp,dx:c.ramp?.[0]||0,dz:c.ramp?.[1]||0});}yield;}
 const expanded=yield* bridge.generateWorldSteps({...RUN_SETTINGS,size:next},previous);if(G!==owner)return;
 const cells=Array.from({length:next},()=>Array(next));
 for(let i=0;i<expanded.cells.length;i++){if(i%64===0)yield;const t=expanded.cells[i],x=t.x+offset,z=t.z+offset;const kept=x>=offset&&z>=offset&&x<old+offset&&z<old+offset;cells[x][z]=kept?G.cells[x-offset][z-offset]:{type:'wild',tower:null,obst:!t.ramp&&((hashStr(G.seed+'/'+(x-next/2)+'/'+(z-next/2))>>>0)%1000)/1000<RUN_SETTINGS.trees?'tree':null,site:0,lvl:t.h,ramp:t.ramp?[t.dx,t.dz]:null};}
 if(G!==owner)return;
 const shift=p=>p&&[p[0]+offset,p[1]+offset];for(const s of G.sites){s.core=shift(s.core);s.cells=s.cells.map(shift);s.gates=s.gates.map(shift);}for(const t of G.towers){t.cx+=offset;t.cz+=offset;}for(const e of G.enemies){e.cell=shift(e.cell);e.next=shift(e.next);e.travelPlan=null;e.planRevision=-1;}for(const l of [...G.lairs,...G.chests,...G.shrines])l.cell=shift(l.cell);
 G.cells=cells;WORLD=next;HALF=(next-1)/2;RUN_SETTINGS.size=next;navRevision++;navEdges.clear();navAnchors.clear();G.nav=null;G.navLarge=null;placementCache.clear();G.groundCenter=null;
 // New trees are instanced in bounded batches; existing resources keep their identity.
 const rng=mulberry32(hashStr(G.seed+'mesh')),entries=[];
 for(let x=0;x<next;x++){for(let z=0;z<next;z++){if(cells[x][z].obst!=='tree')continue;const s=.8+rng()*.5,jx=(rng()-.5)*.8,jz=(rng()-.5)*.8,yaw=rng()*6;if(x<offset||z<offset||x>=old+offset||z>=old+offset)entries.push({x,z,s,jx,jz,yaw});}yield;}
 for(let start=0;start<entries.length;start+=32){const batch=entries.slice(start,start+32),crown=new THREE.InstancedMesh(new THREE.ConeGeometry(.95,3.2,6),new THREE.MeshStandardMaterial({color:0x1f3d2c,roughness:1}),batch.length),trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.18,.24,1.2,5),new THREE.MeshStandardMaterial({color:0x3a2a22}),batch.length),dummy=new THREE.Object3D();batch.forEach(({x,z,s,jx,jz,yaw},i)=>{const p=cellToWorld(x,z),y=cells[x][z].lvl*LSTEP;dummy.rotation.set(0,yaw,0);dummy.position.set(p.x+jx,y+1.9*s,p.z+jz);dummy.scale.setScalar(s);dummy.updateMatrix();crown.setMatrixAt(i,dummy.matrix);dummy.position.set(p.x+jx,y+.5,p.z+jz);dummy.scale.setScalar(1);dummy.updateMatrix();trunk.setMatrixAt(i,dummy.matrix);const body={...bodyCircle(p.x+jx,p.z+jz,y,.24,3.3*s,'tree'),draw:[{mesh:crown,index:i},{mesh:trunk,index:i}]};G.generatedBodies.push(body);G.collisionBodies.push(body);for(let a=Math.floor((body.x-body.r)/4);a<=Math.floor((body.x+body.r)/4);a++)for(let b=Math.floor((body.z-body.r)/4);b<=Math.floor((body.z+body.r)/4);b++){const key=a+','+b;if(!G.bodyBins.has(key))G.bodyBins.set(key,[]);G.bodyBins.get(key).push(body);}});crown.castShadow=trunk.castShadow=true;G.world.add(crown,trunk);yield;}
 buildMinimapBase();setMsg('New terrain discovered',next+' × '+next+' tiles',2);
}
expandTerrain=function(){if(!plateauMode()||!bridge.generateWorldSteps)return reloadExpansion();if(!G.expansionJob)G.expansionJob=expansionSteps();if(!streamingFrame){while(!G.expansionJob.next().done){}G.expansionJob=null;}};
function advanceExpansion(budget=2){if(!G.expansionJob)return;const start=frameClock();do{if(G.expansionJob.next().done){G.expansionJob=null;break;}}while(frameClock()-start<budget);}
const expansionPlayer=updatePlayer;updatePlayer=function(dt){streamingFrame=true;try{expansionPlayer(dt);advanceExpansion();}finally{streamingFrame=false;}};

const pacedWalkSegment=walkSegment;walkSegment=function(a,b,...args){if(deferredNavigation&&Math.hypot(a.x-b.x,a.z-b.z)>CELL*2)return false;return pacedWalkSegment(a,b,...args);};

const waitingWalkResident=walkResident;walkResident=function(w,...args){const pending=pendingResidents.get(w);if(pending&&!pending.done&&routeOwner===G&&routeRevision===navRevision)w.stalled=0;const prior=waitingResident;waitingResident=w;try{return waitingWalkResident(w,...args);}finally{waitingResident=prior;}};

let navigationFrameOwner=null,navigationFrameTime=-1;
function pumpNavigation(){if(navigationFrameOwner===G&&navigationFrameTime===G.time)return;navigationFrameOwner=G;navigationFrameTime=G.time;advanceRouteJobs();}
