/* Integrates the supplied game with the terrain lab and versioned saves. */
let menuPaused=false,restoredDraft=null;
const originalRollCards=rollCards;
rollCards=function(){if(restoredDraft){const cards=restoredDraft;restoredDraft=null;return cards.map(c=>c.kind==='relic'?{kind:'relic',r:RELICS.find(r=>r.id===c.id)}:{kind:'upgrade',u:UPGRADES.find(u=>u.id===c.id)});}return originalRollCards();};

genHeights=function(){
 let world=RUN_SETTINGS.terrain;if(!world)world=bridge.generateWorld({...RUN_SETTINGS,size:WORLD,seed:G.seed,dynamic:false});else if(world.settings.size<WORLD)world=bridge.generateWorld({...RUN_SETTINGS,size:WORLD},world);
 for(const tile of world.cells){const c=G.cells[tile.x-world.originX][tile.z-world.originZ];c.lvl=tile.h;c.ramp=tile.ramp?[tile.dx,tile.dz]:null;}
};
terrainPassable=function(ax,az,bx,bz){
 if(!cellAt(ax,az)||!cellAt(bx,bz))return false;
 const a=cellToWorld(ax,az),b=cellToWorld(bx,bz),mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
 const h=(x,z)=>{const c=cellAt(x,z),u=clamp(mx/CELL+HALF-x+.5,0,1),v=clamp(mz/CELL+HALF-z+.5,0,1),cs=cornerHeights(x,z);return(cs[0]*(1-u)+cs[1]*u)*(1-v)+(cs[2]*(1-u)+cs[3]*u)*v;};
 return Math.abs(h(ax,az)-h(bx,bz))<.01;
};
// Decorations remain traversable so they cannot seal the generator's only ramp route.
solid=function(x,z){const c=cellAt(x,z);return !c||!!(c.tower&&c.tower.b.blocks);};
groundHit=function(){const hits=raycaster.intersectObject(G.terrain,false);return hits.length?hits[0].point:null;};
const originalUpdateCamera=updateCamera;
updateCamera=function(){originalUpdateCamera();const p=G.player.pos;sun.position.set(p.x+24,p.y+44,p.z+16);sun.target.position.copy(p);camera.far=Math.max(500,WORLD*CELL*3);camera.updateProjectionMatrix();if(G.view!=='first')camera.position.y=Math.max(camera.position.y,heightAt(camera.position.x,camera.position.z)+1.5);};

function discardWorld(){if(!G?.world)return;scene.remove(G.world);const geometries=new Set(),materials=new Set();G.world.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
const originalNewRun=newRun;
newRun=function(classId,seed){discardWorld();originalNewRun(classId,seed);bridge.started();};

function pack(value){if(value?.isVector3)return{$v:value.toArray()};if(Array.isArray(value))return value.map(pack);if(value&&typeof value==='object'){const out={};for(const [k,v]of Object.entries(value)){if(['mesh','group','body','hb','d','b','coreMesh','routeLines','routes','gatePos','hitSet'].includes(k)||typeof v==='function'||v?.isObject3D||v instanceof Set)continue;out[k]=pack(v);}return out;}return value;}
function unpack(value){if(value?.$v)return V3(...value.$v);if(Array.isArray(value))return value.map(unpack);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,unpack(v)]));return value;}
function snapshot(){
 if(!G||G.phase==='over')return null;const liveEnemies=G.enemies.filter(e=>!e.dead);
 return {version:1,savedAt:new Date().toISOString(),config:{...RUN_SETTINGS,terrain:undefined},seed:G.seed,classId:G.classId,rng:G.rng.getState(),
  state:pack(Object.fromEntries(['phase','wave','gold','kills','taken','mult','placedCount','view','selected','time','spawnQueue','spawnT','draftSource','startPos','player','cameraDistance','buildMode'].filter(k=>G[k]!==undefined).map(k=>[k,G[k]]))),
  cells:G.cells.map(col=>col.map(c=>({type:c.type,obst:c.obst,site:c.site,lvl:c.lvl,ramp:c.ramp}))),
  sites:G.sites.map(pack),activeSite:G.site?.id??null,towers:G.towers.map(t=>({...pack(t),build:t.b.id})),
  enemies:liveEnemies.map(pack),bolts:G.bolts.map(b=>({...pack(b),hitIndices:b.hitSet?[...b.hitSet].map(e=>liveEnemies.indexOf(e)).filter(i=>i>=0):null})),
  chests:G.chests.map(pack),shrines:G.shrines.map(pack),lairs:G.lairs.map(pack),relics:G.relics.map(r=>r.id),
  draft:!$('draft').classList.contains('hidden')?(G.draft||[]).map(c=>({kind:c.kind,id:(c.r||c.u).id})):null};
}
function validateSave(s){
 if(!s||s.version!==1||!CLASSES[s.classId]||typeof s.seed!=='string'||s.seed.length>80||!s.state||!['explore','build','fight'].includes(s.state.phase)||!Number.isFinite(s.rng))throw Error('This save is invalid or from an unsupported version.');
 if(!Array.isArray(s.cells)||s.cells.length!==WORLD||s.cells.some(col=>!Array.isArray(col)||col.length!==WORLD||col.some(c=>!Number.isFinite(c.lvl)||c.lvl<0||c.lvl>WORLD*WORLD||c.ramp&&(!Array.isArray(c.ramp)||c.ramp.length!==2||Math.abs(c.ramp[0])+Math.abs(c.ramp[1])!==1))))throw Error('Invalid terrain in saved game.');
 for(const k of ['sites','towers','enemies','bolts','chests','shrines','lairs','relics'])if(!Array.isArray(s[k])||s[k].length>20000)throw Error('Invalid saved '+k);
 if(s.sites.length>4||s.activeSite!==null&&!s.sites.some(site=>site.id===s.activeSite)||s.state.phase!=='explore'&&s.activeSite===null)throw Error('Invalid bastion state.');
 if(s.towers.some(t=>!BUILDS.some(b=>b.id===t.build)||!inGrid(t.cx,t.cz))||s.enemies.some(e=>!ENEMIES[e.type])||s.relics.some(id=>!RELICS.some(r=>r.id===id)))throw Error('Unknown saved item.');
 if(s.towers.some(t=>t.edge&&(!['N','E','S','W'].includes(t.edge)||t.build!=='barricade')))throw Error('Invalid wall edge.');
 if(s.draft&&s.draft.some(c=>!(c.kind==='relic'?RELICS:UPGRADES).some(r=>r.id===c.id)))throw Error('Invalid relic draft.');
 for(const key of ['wave','gold','kills','time'])if(!Number.isFinite(s.state[key])||s.state[key]<0)throw Error('Invalid run statistics.');
 const p=s.state.player;if(!p||!Array.isArray(p.pos?.$v)||p.pos.$v.length!==3||!p.pos.$v.every(Number.isFinite)||!Number.isFinite(p.hp)||!Number.isFinite(p.maxHp)||p.maxHp<=0)throw Error('Invalid player state.');
}
function restoreSave(s){
 const oldSize=WORLD;WORLD=s.config.size;HALF=(WORLD-1)/2;try{validateSave(s);}catch(e){WORLD=oldSize;HALF=(WORLD-1)/2;throw e;}RUN_SETTINGS.size=WORLD;discardWorld();const state=unpack(s.state);
 G={...state,seed:s.seed,classId:s.classId,rng:mulberry32(s.rng),cells:s.cells.map(col=>col.map(c=>({...c,tower:null}))),world:new THREE.Group(),enemies:[],bolts:[],tracers:[],towers:[],sites:[],site:null,dist:{},msgT:0,relics:s.relics.map(id=>RELICS.find(r=>r.id===id)),chests:unpack(s.chests),shrines:unpack(s.shrines),lairs:unpack(s.lairs)};
 scene.add(G.world);buildWorldMeshes();buildMinimapBase();
 G.playerMesh=makePlayerMesh();G.playerMesh.position.copy(G.player.pos);G.playerMesh.visible=G.player.dead<=0;G.world.add(G.playerMesh);
 for(const saved of s.sites){const site={...unpack(saved),group:new THREE.Group(),routes:[]};restoreSiteVisuals(site);G.sites.push(site);if(site.status==='secured')site.edge.material.color.setHex(0x4ea88c);if(site.id===s.activeSite)G.site=site;}
 for(const saved of s.towers){const t={...unpack(saved),b:BUILDS.find(b=>b.id===saved.build)};t.mesh=t.edge?wallMesh(t):towerMesh(t.b);t.mesh.position.copy(t.pos);G.world.add(t.mesh);G.towers.push(t);if(!t.edge)G.cells[t.cx][t.cz].tower=t;}
 for(const saved of s.enemies){const e=spawnEnemy(saved.type,null,1);Object.assign(e,unpack(saved));e.mesh.position.copy(e.pos);}
 for(const saved of s.bolts){const b=unpack(saved);b.mesh=new THREE.Mesh(b.hitIndices?new THREE.BoxGeometry(.12,.12,.9):new THREE.SphereGeometry(b.aoe?.22:.12,8,6),new THREE.MeshBasicMaterial({color:b.aoe?0xe2672a:0xe7dcc3}));b.mesh.position.copy(b.pos);if(b.hitIndices)b.hitSet=new Set(b.hitIndices.map(i=>G.enemies[i]).filter(Boolean));G.world.add(b.mesh);G.bolts.push(b);}
 for(const ch of G.chests)if(ch.taken)G.world.remove(ch.mesh);for(const sh of G.shrines)if(sh.used)sh.mesh.material.emissiveIntensity=0;
 if(G.site)refreshRoutes();G.rng.setState(s.rng);keys={};menuPaused=false;
 $('start').classList.add('hidden');$('end').classList.add('hidden');$('hud').classList.remove('hidden');$('draft').classList.add('hidden');$('className').textContent=CLASSES[G.classId].name;buildHotbar();renderRelics();setView(G.view);updateHud();
 if(s.draft){restoredDraft=s.draft;openDraft(G.draftSource);}bridge.started();setMsg('Run restored','Your ground, defenses, and progress are intact.',3);
}
function saveRun(silent=false){const s=snapshot();if(!s){if(!silent)bridge.notify('Start a run before saving.');return false;}const ok=bridge.save(s,silent);if(ok&&$('saveState'))$('saveState').textContent='Saved '+new Date().toLocaleTimeString();return ok;}
function pauseGame(paused){menuPaused=paused;keys={};if(paused&&document.pointerLockElement)document.exitPointerLock();}
window.bastion={snapshot,restoreSave,pause:pauseGame,save:saveRun};
function installIntegration(){
 const bar=document.createElement('div');bar.id='runToolbar';bar.innerHTML='<button id="saveRun">Save game</button><button id="menuRun">Menu / pause</button><span id="saveState">Autosaves every 30 seconds</span>';document.body.appendChild(bar);
 $('saveRun').onclick=()=>saveRun();$('menuRun').onclick=()=>{pauseGame(true);if(G&&G.phase!=='over')saveRun();bridge.menu();};
 addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();pauseGame(true);saveRun(true);bridge.menu();}},true);
 addEventListener('blur',()=>{if(G&&G.phase!=='over'&&!menuPaused){pauseGame(true);saveRun(true);bridge.menu();}});
 addEventListener('pagehide',()=>{if(G&&G.phase!=='over')saveRun(true);});
 setInterval(()=>{if(G&&G.phase!=='over'&&!menuPaused)saveRun(true);},30000);
 $('c').addEventListener('wheel',e=>{if(!G||menuPaused)return;e.preventDefault();G.cameraDistance=clamp((G.cameraDistance||8)+e.deltaY*.012,4,22);},{passive:false});
 const actions=document.createElement('div');actions.id='missionActions';actions.innerHTML='<button id="buildMode">Build mode (Tab)</button><button id="missionPrimary">Found bastion (B)</button><button id="cycleView">Change view (V)</button><span id="missionHint">Space jump · Shift sprint · Tab build · wheel zoom</span>';document.body.appendChild(actions);
 $('missionPrimary').onclick=()=>{if(menuPaused||!G||!$('draft').classList.contains('hidden'))return;if(G.phase==='explore')foundSite();else if(G.phase==='build')startWave();};
 $('buildMode').onclick=toggleBuildMode;
 $('cycleView').onclick=()=>{if(G&&!menuPaused)setView(G.view==='top'?'third':G.view==='third'?'first':'top');};
 $('seed').value=RUN_SETTINGS.seed;
 if(bridge.saved){try{restoreSave(bridge.saved);}catch(err){bridge.notify('Could not load: '+err.message);bridge.menu();}}
}

// Cursor previews reuse path checks until a structure or site changes.
let placementCache=new Map();
const uncachedCanPlace=canPlace;
canPlace=function(b,x,z){const k=b.id+'/'+x+'/'+z;if(!placementCache.has(k))placementCache.set(k,uncachedCanPlace(b,x,z));return placementCache.get(k);};
const plainPlace=place,plainSell=sell,plainFound=foundSite,plainRestore=restoreSave,plainNew=newRun;
place=function(...args){const r=plainPlace(...args);placementCache.clear();return r;};
sell=function(...args){const r=plainSell(...args);placementCache.clear();return r;};
foundSite=function(...args){placementCache.clear();return plainFound(...args);};
restoreSave=function(...args){placementCache.clear();return plainRestore(...args);};
newRun=function(...args){placementCache.clear();return plainNew(...args);};
window.bastion.restoreSave=restoreSave;
const baseHud=updateHud;
updateHud=function(){baseHud();const primary=$('missionPrimary');if(!primary)return;primary.textContent=G.phase==='explore'?'Found bastion (B)':G.phase==='build'?'Start wave '+G.wave+' (Enter)':'Hold the line';primary.disabled=G.phase==='fight'||G.phase==='over';const b=BUILDS[G.selected];$('missionHint').textContent=G.phase==='build'?b.name+' · '+buildCost(b)+' gold'+(b.range?' · '+b.range+' m range':'')+' · Tab build · F place / X sell':'Space jump · Shift sprint · Tab build · wheel zoom · mouse buttons attack';};

// Player-only vertical physics; enemies continue to follow connected terrain routes.
function jumpPlayer(){if(!G||menuPaused||G.player.dead>0)return;const p=G.player;if(p.pos.y<=heightAt(p.pos.x,p.pos.z)+.08){p.vy=9;p.pos.y+=.09;}}
const groundedMove=tryMove;
tryMove=function(pos,dx,dz){if(pos!==G.player.pos)return groundedMove(pos,dx,dz);const limit=WORLD*CELL/2-.4;const attempt=(x,z)=>{x=clamp(x,-limit,limit);z=clamp(z,-limit,limit);const [cx,cz]=worldToCell(V3(x,0,z));const h=heightAt(x,z);if(!wallCrossing(...worldToCell(pos),cx,cz)&&!solid(cx,cz)&&cellAt(cx,cz).type!=='core'&&h<=pos.y+.28){pos.x=x;pos.z=z;return true;}return false;};if(!attempt(pos.x+dx,pos.z+dz)){attempt(pos.x+dx,pos.z);attempt(pos.x,pos.z+dz);}};
const walkingUpdate=updatePlayer;
updatePlayer=function(dt){walkingUpdate(dt);const p=G.player;if(p.dead>0){p.vy=0;return;}p.vy=(p.vy||0)-24*dt;p.pos.y+=p.vy*dt;const ground=heightAt(p.pos.x,p.pos.z);if(p.pos.y<=ground){p.pos.y=ground;p.vy=0;}G.playerMesh.position.copy(p.pos);if(RUN_SETTINGS.dynamic&&!menuPaused&&Math.max(Math.abs(p.pos.x),Math.abs(p.pos.z))>(WORLD/2-6)*CELL)expandTerrain();};
function toggleBuildMode(){if(!G||menuPaused)return;G.buildMode=!G.buildMode;keys={};if(G.buildMode){G.combatView=G.view;setView('top');document.exitPointerLock?.();}else{setView(G.combatView||'third');}updateHud();}
const modeHud=updateHud;
updateHud=function(){modeHud();if($('buildMode'))$('buildMode').textContent=G.buildMode?'Combat mode (Tab)':'Build mode (Tab)';};
function expandTerrain(){const max=Math.min(1024,RUN_SETTINGS.maxSize||1024);if(WORLD>=max)return;const old=WORLD,next=Math.min(max,WORLD+16),offset=(next-old)/2;if(offset<1)return;
 const s=snapshot();if(!s)return;const previous={settings:{...RUN_SETTINGS,size:old},originX:0,originZ:0,root:0,cells:[],stats:{}};
 for(let z=0;z<old;z++)for(let x=0;x<old;x++){const c=s.cells[x][z];previous.cells.push({x,z,h:c.lvl,parent:-1,ramp:!!c.ramp,dx:c.ramp?.[0]||0,dz:c.ramp?.[1]||0});}
 const expanded=bridge.generateWorld({...RUN_SETTINGS,size:next},previous);const cells=Array.from({length:next},()=>Array(next));for(const t of expanded.cells){const x=t.x+offset,z=t.z+offset;cells[x][z]=x>=offset&&z>=offset&&x<old+offset&&z<old+offset?s.cells[x-offset][z-offset]:{type:'wild',tower:null,obst:!t.ramp&&((hashStr(G.seed+'/'+(x-next/2)+'/'+(z-next/2))>>>0)%1000)/1000<RUN_SETTINGS.trees?'tree':null,site:0,lvl:t.h,ramp:t.ramp?[t.dx,t.dz]:null};}
 const shift=p=>p&&[p[0]+offset,p[1]+offset];for(const site of s.sites){site.core=shift(site.core);site.cells=site.cells.map(shift);site.gates=site.gates.map(shift);}for(const t of s.towers){t.cx+=offset;t.cz+=offset;}for(const e of s.enemies){e.cell=shift(e.cell);e.next=shift(e.next);}for(const l of [...s.lairs,...s.chests,...s.shrines])l.cell=shift(l.cell);
 s.cells=cells;s.config={...s.config,size:next};restoreSave(s);setMsg('New terrain discovered',next+' × '+next+' tiles',2);
}

function requestAimLock(){const c=$('c');if(!c.requestPointerLock){G.noLock=true;return;}try{const result=c.requestPointerLock();if(result?.catch)result.catch(()=>{if(!G.noLock)log('Mouse capture unavailable: hold a mouse button and drag to aim. Tab opens building.');G.noLock=true;});}catch{G.noLock=true;}}
document.addEventListener('pointerlockchange',()=>{keys.MouseL=false;keys.MouseR=false;if(G&&document.pointerLockElement===$('c')){G.noLock=false;mouse.x=mouse.y=0;}});
