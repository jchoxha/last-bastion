const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),THREE=require('three');
const {generateWorld}=require('../lib/world.ts');
class Element{constructor(){this.children=[];this.style={};this.dataset={};this.value='';this.classes=new Set(['hidden']);this.classList={add:s=>this.classes.add(s),remove:s=>this.classes.delete(s),contains:s=>this.classes.has(s),toggle:(s,on)=>{if(on??!this.classes.has(s))this.classes.add(s);else this.classes.delete(s);}};}set innerHTML(v){this.html=v;if(v==='')this.children=[];}get innerHTML(){return this.html||'';}appendChild(c){c.parent=this;this.children.push(c);}get firstChild(){return this.children[0];}querySelector(){return new Element();}addEventListener(){}remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}getContext(){return new Proxy({},{get:()=>()=>{}});}}
const nodes=new Map();const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},createElement:()=>new Element(),body:new Element(),pointerLockElement:null,exitPointerLock(){},addEventListener(){}};
let source=fs.readFileSync('work/bastion-integrated.js','utf8');source=source.slice(0,source.lastIndexOf('try{initThree();'));
const settings={seed:'BASTION',size:64,hilliness:.15,trees:.22,scale:.5,dynamic:false};
const sandbox={parent:{__lastBastionBridge:{THREE,generateWorld,settings,started(){},notify(){},menu(){},save(){return true;}}},document,console,innerWidth:1200,innerHeight:800,devicePixelRatio:1,setTimeout:()=>0,setInterval:()=>0,requestAnimationFrame:()=>0,addEventListener(){}};sandbox.window=sandbox;
vm.createContext(sandbox);vm.runInContext(source+`\nscene=new THREE.Scene();camera=new THREE.PerspectiveCamera();sun=new THREE.DirectionalLight();renderer={render(){}};globalThis.api={stepOk,edgeKey,wallPlacement,jumpPlayer,tryMove,updatePlayer,expandTerrain,toggleBuildMode,newRun,foundSite,startWave,spawnEnemy,damage,place,sell,canPlace,secureSite,snapshot,restoreSave,validateSave,openDraft,closeDraft,updateEnemies,updateTowers,updateBolts,makeWave,terrainPassable,cellToWorld,heightAt,getG:()=>G,builds:BUILDS,setPos:(x,z)=>{G.player.pos=cellToWorld(x,z);G.player.pos.y=heightAt(G.player.pos.x,G.player.pos.z);}};`,sandbox);
const a=sandbox.api;let saves=0;
function comparable(s){const c=JSON.parse(JSON.stringify(s));delete c.savedAt;return c;}
function roundtrip(){const s=a.snapshot();assert(s);a.restoreSave(JSON.parse(JSON.stringify(s)));assert.deepEqual(comparable(a.snapshot()),comparable(s));saves++;}
a.newRun('ranger','BASTION');assert.equal(a.getG().player.maxHp,85);assert.equal(a.getG().lairs.length,5);roundtrip();
let founded=false;for(let x=11;x<53&&!founded;x+=3)for(let z=11;z<53&&!founded;z+=3){a.setPos(x,z);a.foundSite();founded=!!a.getG().site;}
assert(founded,'A legal bastion can be founded');assert.equal(a.getG().sites.length,1,'Founded bastion is registered');
a.getG().gold=10000;
for(const b of a.builds){let placed=false;for(const [x,z]of a.getG().site.cells){if(a.canPlace(b,x,z)){a.place(b,x,z);placed=true;break;}}assert(placed,'Can place '+b.id);}
assert.equal(a.getG().towers.length,8);roundtrip();
a.startWave();assert.equal(a.getG().phase,'fight');assert(a.getG().spawnQueue.length>0);a.updateEnemies(.5);a.updateTowers(.1);a.updateBolts(.1);roundtrip();
const e=a.spawnEnemy('grunt',0,1),gold=a.getG().gold;a.damage(e,100000);assert(e.dead);assert(a.getG().gold>gold);
a.getG().enemies=a.getG().enemies.filter(e=>!e.dead);a.openDraft('shrine');roundtrip();a.closeDraft();
// A dead enemy before a live one must not shift piercing projectile hit references.
const dead=a.spawnEnemy('grunt',0,1),live=a.spawnEnemy('runner',0,1);a.damage(dead,99999);live.hp=7;
a.getG().bolts.push({pos:new THREE.Vector3(0,10,0),vel:new THREE.Vector3(1,0,0),mesh:new THREE.Mesh(),dmg:12,life:1,pierce:true,hitSet:new Set([dead,live])});
roundtrip();const restoredBolt=a.getG().bolts.at(-1);assert.equal(restoredBolt.hitSet.size,1);assert.equal([...restoredBolt.hitSet][0].hp,7);
// Selling after a discount uses the actual purchase price.
const tower=a.getG().towers.find(t=>t.b.id==='arrow'),before=a.getG().gold;a.getG().taken.cheap=true;a.sell(tower.cx,tower.cz);assert.equal(a.getG().gold-before,Math.round(tower.paid*.6));delete a.getG().taken.cheap;
console.log('PASS: piercing-projectile references survive removed enemies; selling refunds actual paid cost.');
const bad=JSON.parse(JSON.stringify(a.snapshot()));bad.version=999;assert.throws(()=>a.restoreSave(bad));assert.equal(a.getG().classId,'ranger');
const broken=JSON.parse(JSON.stringify(a.snapshot()));broken.cells=[];assert.throws(()=>a.restoreSave(broken));
console.log(`PASS: classes, camps, bastion registration, all 8 builds, wave/combat, draft, ${saves} exact save/load round trips, and corrupt-save rejection.`);

// Dynamic growth keeps positions and defenses while reindexing the grid.
const beforeGrowth=JSON.parse(JSON.stringify(a.snapshot()));const position=a.getG().player.pos.clone();settings.maxSize=80;a.expandTerrain();assert.equal(a.getG().cells.length,80);assert(a.getG().player.pos.equals(position));assert.equal(a.getG().towers[0].cx,beforeGrowth.towers[0].cx+8);assert.equal(a.getG().sites[0].core[0],beforeGrowth.sites[0].core[0]+8);a.expandTerrain();assert.equal(a.getG().cells.length,80);roundtrip();a.restoreSave(beforeGrowth);delete settings.maxSize;
// Jump rises, lands, and allows an airborne save. Walking down a ledge retains altitude.
a.setPos(32,32);const py=a.getG().player.pos.y;a.jumpPlayer();a.updatePlayer(.05);assert(a.getG().player.pos.y>py+.2);roundtrip();for(let i=0;i<80;i++)a.updatePlayer(.025);assert.equal(a.getG().player.pos.y,a.heightAt(a.getG().player.pos.x,a.getG().player.pos.z));
const p=a.getG().player.pos;p.y+=10;const airborne=p.y;a.tryMove(p,.1,0);assert.equal(p.y,airborne);a.updatePlayer(.05);assert(p.y<airborne);a.restoreSave(beforeGrowth);
a.toggleBuildMode();assert.equal(a.getG().buildMode,true);assert.equal(a.getG().view,'top');a.toggleBuildMode();assert.equal(a.getG().buildMode,false);
console.log('PASS: jump/landing/airborne save, build mode, expansion preservation, expansion cap, expanded-save round trip.');

// Complete four sites using the game's actual founding and securing rules.
for(let count=0;count<4;count++){
 if(!a.getG().site){let ok=false;for(let x=10;x<54&&!ok;x++)for(let z=10;z<54&&!ok;z++){a.setPos(x,z);a.foundSite();ok=!!a.getG().site;}assert(ok,'Legal ground remains for bastion '+(count+1));}
 a.getG().enemies=a.getG().enemies.filter(e=>e.mode==='roam');a.getG().spawnQueue=[];a.getG().site.wave=5;a.secureSite();
}
assert.equal(a.getG().phase,'over');assert.equal(a.getG().sites.filter(s=>s.status==='secured').length,4);console.log('PASS: four distinct legal bastions can be secured and trigger victory.');

// A saved, already-expanded lab map is used verbatim in a new run.
const small=generateWorld({...settings,size:20,seed:'SAVED-MAP'});const grown=generateWorld({...settings,size:36,seed:'SAVED-MAP'},small);settings.terrain=grown;settings.size=64;a.newRun('knight','SAVED-MAP');const pad=(64-grown.settings.size)/2;for(const tile of grown.cells){const c=a.getG().cells[tile.x-grown.originX+pad][tile.z-grown.originZ+pad];assert.equal(c.lvl,tile.h);assert.equal(!!c.ramp,tile.ramp);}delete settings.terrain;
console.log('PASS: saved lab terrain and explored extensions preserved when starting a game.');

// Four edge walls coexist with a center tower, shared edges are unique, and saves retain walls.
let wallSite=false;for(let x=11;x<53&&!wallSite;x+=3)for(let z=11;z<53&&!wallSite;z+=3){a.setPos(x,z);a.foundSite();wallSite=!!a.getG().site;}assert(wallSite);a.getG().gold=100000;
const wallBuild=a.builds.find(b=>b.wall),arrowBuild=a.builds.find(b=>b.id==='arrow');let lot=null;
for(const [x,z] of a.getG().site.cells){if(a.canPlace(arrowBuild,x,z)&&['N','E','S','W'].every(side=>a.canPlace(wallBuild,x,z,side))){lot=[x,z];break;}}assert(lot,'Find a flat tower lot');const [wx,wz]=lot;a.place(arrowBuild,wx,wz);const centerTower=a.getG().cells[wx][wz].tower;
for(const side of ['N','E','S','W']){assert(a.canPlace(wallBuild,wx,wz,side));a.place(wallBuild,wx,wz,side);}assert.equal(a.getG().towers.filter(t=>t.edge&&t.cx===wx&&t.cz===wz).length,4);assert.equal(a.getG().cells[wx][wz].tower,centerTower);assert(!a.canPlace(wallBuild,wx+1,wz,'W'),'Shared edge cannot be bought twice');assert(!a.stepOk(wx,wz,wx+1,wz));assert(!a.stepOk(wx,wz,wx+1,wz+1),'No diagonal corner cutting');roundtrip();assert.equal(a.getG().cells[wx][wz].tower.b.id,'arrow');
const goldBeforeWallSale=a.getG().gold,wallRefund=Math.round(a.getG().towers.find(t=>t.cx===wx&&t.cz===wz&&t.edge==="E").paid*.6);a.sell(wx+1,wz,'W');assert.equal(a.getG().gold-goldBeforeWallSale,wallRefund);assert.equal(a.getG().cells[wx][wz].tower.b.id,'arrow');assert(a.canPlace(wallBuild,wx,wz,'E'));a.place(wallBuild,wx,wz,'E');
const preservedEdges=a.getG().towers.filter(t=>t.edge).map(t=>[t.cx,t.cz,t.edge]);settings.maxSize=80;a.expandTerrain();for(const [x,z,side]of preservedEdges)assert(a.getG().towers.some(t=>t.cx===x+8&&t.cz===z+8&&t.edge===side));roundtrip();
console.log('PASS: four walls plus tower, shared-edge deduplication and selling, blocked cardinal/diagonal routes, wall saves and expansion.');

// The final segment around a core must be rejected, including diagonal bypasses.
delete settings.terrain;settings.hilliness=0;a.newRun('knight','WALL-ROUTES');a.setPos(40,40);a.foundSite();assert(a.getG().site);a.getG().gold=100000;const [coreX,coreZ]=a.getG().site.core;
for(const [dx,dz,side]of [[0,-1,'S'],[1,0,'W'],[0,1,'N']]){assert(a.canPlace(wallBuild,coreX+dx,coreZ+dz,side));a.place(wallBuild,coreX+dx,coreZ+dz,side);}
assert(!a.canPlace(wallBuild,coreX-1,coreZ,'E'),'Last route to core stays open');
// Player collision uses the same boundary, independently of tile-center occupancy.
const northWall=a.getG().towers.find(t=>t.edge==='S');a.place(wallBuild,northWall.cx,northWall.cz,'E');assert(a.getG().towers.some(t=>t.cx===northWall.cx&&t.cz===northWall.cz&&t.edge==='E'));const from=a.cellToWorld(northWall.cx,northWall.cz);a.getG().player.pos.copy(from);a.getG().player.pos.x+=1.45;const xBefore=a.getG().player.pos.x;a.tryMove(a.getG().player.pos,.2,0);assert.equal(a.getG().player.pos.x,xBefore);
console.log('PASS: cannot seal core routes; player movement respects edge walls.');
