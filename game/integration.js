/* Integrates the supplied game with the terrain lab and versioned saves. */
let menuPaused=false,restoredDraft=null;
const originalRollCards=rollCards;
rollCards=function(){if(restoredDraft){const cards=restoredDraft;restoredDraft=null;return cards.map(c=>c.kind==='relic'?{kind:'relic',r:RELICS.find(r=>r.id===c.id)}:{kind:'upgrade',u:UPGRADES.find(u=>u.id===c.id)});}return originalRollCards();};

genHeights=function(){
 const world=bridge.generateWorld({...RUN_SETTINGS,size:WORLD,seed:G.seed,dynamic:false});
 for(const tile of world.cells){const c=G.cells[tile.x][tile.z];c.lvl=tile.h;c.ramp=tile.ramp?[tile.dx,tile.dz]:null;}
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

function pack(value){if(value?.isVector3)return{$v:value.toArray()};if(Array.isArray(value))return value.map(pack);if(value&&typeof value==='object'){const out={};for(const [k,v]of Object.entries(value)){if(['mesh','group','body','hb','d','b','edge','coreMesh','routeLines','routes','gatePos','hitSet'].includes(k)||typeof v==='function'||v?.isObject3D||v instanceof Set)continue;out[k]=pack(v);}return out;}return value;}
function unpack(value){if(value?.$v)return V3(...value.$v);if(Array.isArray(value))return value.map(unpack);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,unpack(v)]));return value;}
function snapshot(){
 if(!G||G.phase==='over')return null;
 return {version:1,savedAt:new Date().toISOString(),config:RUN_SETTINGS,seed:G.seed,classId:G.classId,rng:G.rng.getState(),
  state:pack(Object.fromEntries(['phase','wave','gold','kills','taken','mult','placedCount','view','selected','time','spawnQueue','spawnT','draftSource','startPos','player'].map(k=>[k,G[k]]))),
  cells:G.cells.map(col=>col.map(c=>({type:c.type,obst:c.obst,site:c.site,lvl:c.lvl,ramp:c.ramp}))),
  sites:G.sites.map(pack),activeSite:G.site?.id??null,towers:G.towers.map(t=>({...pack(t),build:t.b.id})),
  enemies:G.enemies.filter(e=>!e.dead).map(pack),bolts:G.bolts.map(b=>({...pack(b),hitIndices:b.hitSet?[...b.hitSet].map(e=>G.enemies.indexOf(e)).filter(i=>i>=0):null})),
  chests:G.chests.map(pack),shrines:G.shrines.map(pack),lairs:G.lairs.map(pack),relics:G.relics.map(r=>r.id),
  draft:!$('draft').classList.contains('hidden')?(G.draft||[]).map(c=>({kind:c.kind,id:(c.r||c.u).id})):null};
}
function validateSave(s){
 if(!s||s.version!==1||!CLASSES[s.classId]||typeof s.seed!=='string'||s.seed.length>80||!s.state||!['explore','build','fight'].includes(s.state.phase)||!Number.isFinite(s.rng))throw Error('This save is invalid or from an unsupported version.');
 if(!Array.isArray(s.cells)||s.cells.length!==WORLD||s.cells.some(col=>!Array.isArray(col)||col.length!==WORLD||col.some(c=>!Number.isFinite(c.lvl)||c.lvl<0||c.lvl>WORLD*WORLD||c.ramp&&(!Array.isArray(c.ramp)||c.ramp.length!==2||Math.abs(c.ramp[0])+Math.abs(c.ramp[1])!==1))))throw Error('Invalid terrain in saved game.');
 for(const k of ['sites','towers','enemies','bolts','chests','shrines','lairs','relics'])if(!Array.isArray(s[k])||s[k].length>20000)throw Error('Invalid saved '+k);
 if(s.sites.length>4||s.activeSite!==null&&!s.sites.some(site=>site.id===s.activeSite)||s.state.phase!=='explore'&&s.activeSite===null)throw Error('Invalid bastion state.');
 if(s.towers.some(t=>!BUILDS.some(b=>b.id===t.build)||!inGrid(t.cx,t.cz))||s.enemies.some(e=>!ENEMIES[e.type])||s.relics.some(id=>!RELICS.some(r=>r.id===id)))throw Error('Unknown saved item.');
 if(s.draft&&s.draft.some(c=>!(c.kind==='relic'?RELICS:UPGRADES).some(r=>r.id===c.id)))throw Error('Invalid relic draft.');
 for(const key of ['wave','gold','kills','time'])if(!Number.isFinite(s.state[key])||s.state[key]<0)throw Error('Invalid run statistics.');
 const p=s.state.player;if(!p||!Array.isArray(p.pos?.$v)||p.pos.$v.length!==3||!p.pos.$v.every(Number.isFinite)||!Number.isFinite(p.hp)||!Number.isFinite(p.maxHp)||p.maxHp<=0)throw Error('Invalid player state.');
}
function restoreSave(s){
 validateSave(s);discardWorld();const state=unpack(s.state);
 G={...state,seed:s.seed,classId:s.classId,rng:mulberry32(s.rng),cells:s.cells.map(col=>col.map(c=>({...c,tower:null}))),world:new THREE.Group(),enemies:[],bolts:[],tracers:[],towers:[],sites:[],site:null,dist:{},msgT:0,relics:s.relics.map(id=>RELICS.find(r=>r.id===id)),chests:unpack(s.chests),shrines:unpack(s.shrines),lairs:unpack(s.lairs)};
 scene.add(G.world);buildWorldMeshes();buildMinimapBase();
 G.playerMesh=makePlayerMesh();G.playerMesh.position.copy(G.player.pos);G.playerMesh.visible=G.player.dead<=0;G.world.add(G.playerMesh);
 for(const saved of s.sites){const site={...unpack(saved),group:new THREE.Group(),routes:[]};restoreSiteVisuals(site);G.sites.push(site);if(site.status==='secured')site.edge.material.color.setHex(0x4ea88c);if(site.id===s.activeSite)G.site=site;}
 for(const saved of s.towers){const t={...unpack(saved),b:BUILDS.find(b=>b.id===saved.build)};t.mesh=towerMesh(t.b);t.mesh.position.copy(t.pos);G.world.add(t.mesh);G.towers.push(t);G.cells[t.cx][t.cz].tower=t;}
 for(const saved of s.enemies){const e=spawnEnemy(saved.type,null,1);Object.assign(e,unpack(saved));e.mesh.position.copy(e.pos);}
 for(const saved of s.bolts){const b=unpack(saved);b.mesh=new THREE.Mesh(b.hitIndices?new THREE.BoxGeometry(.12,.12,.9):new THREE.SphereGeometry(b.aoe?.22:.12,8,6),new THREE.MeshBasicMaterial({color:b.aoe?0xe2672a:0xe7dcc3}));b.mesh.position.copy(b.pos);if(b.hitIndices)b.hitSet=new Set(b.hitIndices.map(i=>G.enemies[i]).filter(Boolean));G.world.add(b.mesh);G.bolts.push(b);}
 for(const ch of G.chests)if(ch.taken)G.world.remove(ch.mesh);for(const sh of G.shrines)if(sh.used)sh.mesh.material.emissiveIntensity=0;
 if(G.site)refreshRoutes();G.rng.setState(s.rng);keys={};menuPaused=false;
 $('start').classList.add('hidden');$('end').classList.add('hidden');$('hud').classList.remove('hidden');$('draft').classList.add('hidden');$('className').textContent=CLASSES[G.classId].name;buildHotbar();renderRelics();setView(G.view);updateHud();
 if(s.draft){restoredDraft=s.draft;openDraft(G.draftSource);}bridge.started();setMsg('Run restored','Your ground, defenses, and progress are intact.',3);
}
function saveRun(){const s=snapshot();if(!s){bridge.notify('Start a run before saving.');return false;}return bridge.save(s);}
function pauseGame(paused){menuPaused=paused;keys={};if(paused&&document.pointerLockElement)document.exitPointerLock();}
window.bastion={snapshot,restoreSave,pause:pauseGame,save:saveRun};
function installIntegration(){
 const bar=document.createElement('div');bar.id='runToolbar';bar.innerHTML='<button id="saveRun">Save game</button><button id="menuRun">Menu / pause</button><span id="saveState">Autosaves every 30 seconds</span>';document.body.appendChild(bar);
 $('saveRun').onclick=()=>saveRun();$('menuRun').onclick=()=>{pauseGame(true);if(G&&G.phase!=='over')saveRun();bridge.menu();};
 addEventListener('keydown',e=>{if(e.code==='Escape'){e.preventDefault();pauseGame(true);bridge.menu();}},true);
 setInterval(()=>{if(G&&G.phase!=='over'&&!menuPaused)saveRun();},30000);
 $('seed').value=RUN_SETTINGS.seed;
 if(bridge.saved){try{restoreSave(bridge.saved);}catch(err){bridge.notify('Could not load: '+err.message);bridge.menu();}}
}
