/* Continuous terrain is opt-in per save: legacy runs retain their cliffs. */
const rollingEnabled=()=>RUN_SETTINGS.terrainMode==='rolling';
const terracedHeight=heightAt;
function rollingGround(x,z){
 const gx=x/CELL+HALF,gz=z/CELL+HALF,ix=Math.floor(gx),iz=Math.floor(gz),smooth=t=>t*t*(3-2*t),u=smooth(gx-ix),v=smooth(gz-iz);
 const sample=(a,b)=>G.cells[clamp(a,0,WORLD-1)][clamp(b,0,WORLD-1)].lvl*LSTEP;
 return (sample(ix,iz)*(1-u)+sample(ix+1,iz)*u)*(1-v)+(sample(ix,iz+1)*(1-u)+sample(ix+1,iz+1)*u)*v;
}
heightAt=function(x,z){if(!rollingEnabled()||!G?.cells)return terracedHeight(x,z);let h=rollingGround(x,z);for(const t of G.stairs||[]){const y=stairSurface(t,x,z);if(y!==null)h=y;}return h;};
const oldTerrainPassable=terrainPassable;
terrainPassable=function(ax,az,bx,bz){if(!rollingEnabled())return oldTerrainPassable(ax,az,bx,bz);if(!cellAt(ax,az)||!cellAt(bx,bz))return false;return Math.abs(tilePoint(ax,az).y-tilePoint(bx,bz).y)<CELL*.6;};
const oldTerrainBuilder=buildTerrainMesh;
buildTerrainMesh=function(){
 if(!rollingEnabled())return oldTerrainBuilder();
 const center=G.player?.pos||V3(),radius=240,step=CELL/6,limit=WORLD*CELL/2;
 const minX=Math.max(-limit,Math.floor((center.x-radius)/step)*step),maxX=Math.min(limit,Math.ceil((center.x+radius)/step)*step),minZ=Math.max(-limit,Math.floor((center.z-radius)/step)*step),maxZ=Math.min(limit,Math.ceil((center.z+radius)/step)*step),nx=Math.round((maxX-minX)/step)+1,nz=Math.round((maxZ-minZ)/step)+1,positions=[],colors=[],uv=[],indices=[];
 for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const wx=minX+x*step,wz=minZ+z*step,h=heightAt(wx,wz),color=new THREE.Color(({frost:0xb3c5bd,desert:0xb1a075,wetland:0x607553,meadow:0x7c925a})[biomeAt(wx,wz)]);const grain=.94+Math.sin(wx*.06+wz*.04)*.06;positions.push(wx,h,wz);colors.push(color.r*grain,color.g*grain,color.b*grain);uv.push(wx*.24,wz*.24);if(x<nx-1&&z<nz-1){const a=z*nx+x;indices.push(a,a+nx,a+1,a+1,a+nx,a+nx+1);}}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();const texture=terrainTexture('grass'),material=new THREE.MeshStandardMaterial({map:texture,bumpMap:texture,bumpScale:.035,vertexColors:true,roughness:1,side:THREE.DoubleSide});
 G.terrain=new THREE.Mesh(geometry,material);G.terrain.receiveShadow=true;G.world.add(G.terrain);G.groundCenter=center.clone();return G.terrain;
};
function removeFoliage(){if(!G.foliage)return;G.world.remove(G.foliage);G.foliage.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});G.foliage=null;}
function seedFoliage(){
 if(!rollingEnabled())return;removeFoliage();const group=new THREE.Group(),grass=[],bushes=[],flowers=[],p=G.player.pos,spacing=2.8,centerX=Math.floor(p.x/spacing),centerZ=Math.floor(p.z/spacing),seed=hashStr(G.seed),rand=(x,z,k)=>{let h=Math.imul(x^seed,374761393)^Math.imul(z,668265263)^Math.imul(k,1274126177);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295;};
 for(let x=centerX-34;x<=centerX+34;x++)for(let z=centerZ-34;z<=centerZ+34;z++){const wx=(x+rand(x,z,1))*spacing,wz=(z+rand(x,z,2))*spacing;if(Math.hypot(wx-p.x,wz-p.z)>94||!inGrid(...worldToCell(V3(wx,0,wz))))continue;if(G.sites.some(s=>Math.hypot(wx-s.corePos.x,wz-s.corePos.z)<CELL*3.3)||G.towers.some(t=>Math.hypot(wx-t.pos.x,wz-t.pos.z)<buildRadius(t.b)+1)||(colony().landmarks||[]).some(l=>Math.hypot(wx-l.pos.x,wz-l.pos.z)<11))continue;const biome=biomeAt(wx,wz),chance=rand(x,z,3);if(biome==='desert'&&chance>.13||biome==='frost'&&chance>.3)continue;const entry=[wx,heightAt(wx,wz),wz,rand(x,z,4),biome];grass.push(entry);if(chance<.055){bushes.push(entry);bushes.push([wx+.34,entry[1]-.08,wz+.2,entry[3]*.6,biome],[wx-.25,entry[1]-.08,wz-.25,entry[3]*.65,biome]);}else if(chance>.96)flowers.push(entry);}
 const blades=[];for(let i=0;i<5;i++){const a=i*2.4,dx=Math.cos(a),dz=Math.sin(a),x=dx*.12,z=dz*.12,h=.25+i*.045;blades.push(x-dz*.035,0,z+dx*.035,x+dz*.035,0,z-dx*.035,x+dx*.08,h,z+dz*.08);}const tuft=new THREE.BufferGeometry();tuft.setAttribute('position',new THREE.Float32BufferAttribute(blades,3));tuft.computeVertexNormals();
 const dummy=new THREE.Object3D();
 function batch(points,geo,color,type){const mat=new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide}),mesh=new THREE.InstancedMesh(geo,mat,points.length);points.forEach(([x,y,z,r,biome],i)=>{dummy.position.set(x,y+(type==='bush'?.35:type==='flower'?.35:0),z);dummy.rotation.set(0,r*Math.PI*2,0);dummy.scale.setScalar(type==='bush'?.55+r*.65:type==='flower'?.07:.55+r);if(type==='bush')dummy.scale.y*=.7;dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(biome==='frost'?0xa8b8a0:type==='flower'?0xd7c47b:biome==='desert'?0xa69657:0x688849).multiplyScalar(.8+r*.35));});mesh.receiveShadow=true;mesh.castShadow=type==='bush';group.add(mesh);}
 batch(grass,tuft,0xffffff,'grass');batch(bushes,new THREE.IcosahedronGeometry(1,1),0xffffff,'bush');batch(flowers,new THREE.IcosahedronGeometry(1,0),0xffffff,'flower');G.world.add(group);G.foliage=group;G.foliageCenter=p.clone();
}
const rollingMotion=updatePlayer;
updatePlayer=function(dt){rollingMotion(dt);if(!rollingEnabled())return;if(!G.groundCenter||G.groundCenter.distanceTo(G.player.pos)>36){if(G.terrain){G.world.remove(G.terrain);G.terrain.geometry.dispose();G.terrain.material.dispose();}buildTerrainMesh();}if(!G.foliageCenter||G.foliageCenter.distanceTo(G.player.pos)>20)seedFoliage();};
const rollingRun=newRun;
newRun=function(...args){rollingRun(...args);updateHud();if(rollingEnabled()){buildMinimapBase();seedFoliage();scene.fog=new THREE.Fog(0xaec7d1,110,220);}};
const rollingRestore=restoreSave;
restoreSave=function(save){rollingRestore(save);if(rollingEnabled()){seedFoliage();scene.fog=new THREE.Fog(0xaec7d1,110,220);}};window.bastion.restoreSave=restoreSave;
// The seed is entered once, on world creation. The class screen simply displays it.
const rollingInstall=installIntegration;
installIntegration=function(){rollingInstall();if(rollingEnabled()){$('seed').readOnly=true;$('seed').title='World seed chosen when creating this run';}};

// Discoveries are keyed to world-space regions, so crossing an expansion edge
// never rerolls a visited location or duplicates a recovered ruin.
function discoverRollingRegions(){
 if(!rollingEnabled())return;const c=colony();c.exploredRegions??={};const span=CELL*16,px=Math.floor(G.player.pos.x/span),pz=Math.floor(G.player.pos.z/span);
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const x=px+dx,z=pz+dz,id=x+','+z;if(c.exploredRegions[id])continue;const rng=mulberry32(hashStr(G.seed+'/region/'+id)),wx=(x+.25+rng()*.5)*span,wz=(z+.25+rng()*.5)*span,pos=V3(wx,heightAt(wx,wz),wz);if(!inGrid(...worldToCell(pos))||pos.distanceTo(G.player.pos)>180)continue;c.exploredRegions[id]=true;if(G.sites.some(s=>s.corePos.distanceTo(pos)<s.r*CELL+30)||c.landmarks.some(l=>l.pos.distanceTo(pos)<60))continue;
 const kind=['ruins','water','dungeon','village'][Math.floor(rng()*4)],site={id:'region-'+id,kind,pos,stage:0,claimed:false,name:kind==='village'?'Wayfarer settlement':kind==='dungeon'?'Ashvault dungeon':kind==='water'?'Springwater pool':'Old-world ruins'};c.landmarks.push(site);landmarkVisual(site);
 if(kind==='village'){const merchant={id:'trader-'+id,pos:pos.clone().add(V3(0,0,2)),hp:250,maxHp:250,role:'laborer',settled:true,stock:{logs:100,stone:80,ore:40,gateKits:2},escorts:[]};for(let j=0;j<2;j++)merchant.escorts.push({id:'escort-'+id+'-'+j,pos:pos.clone().add(V3(j?3:-3,0,1)),hp:160,maxHp:160,role:'knight'});c.caravans.push(merchant);restoreCaravans();}
 rebuildCollision();G.foliageCenter=null;
 }
}
const rollingDiscoveryUpdate=animateWilderness;
animateWilderness=function(dt){rollingDiscoveryUpdate(dt);if(!rollingEnabled())return;G.regionCheck=(G.regionCheck||0)-dt;if(G.regionCheck<=0){G.regionCheck=2;discoverRollingRegions();}};

const localHorizonCamera=updateCamera;updateCamera=function(){localHorizonCamera();if(rollingEnabled()){camera.far=700;camera.updateProjectionMatrix();}};

const groundedLandmarkVisual=landmarkVisual;
landmarkVisual=function(site){if(rollingEnabled()){
 const [cx,cz]=worldToCell(site.pos),radius=site.kind==='water'?1:2;
 for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++){const cell=cellAt(cx+dx,cz+dz);if(cell){cell.lvl=site.pos.y/LSTEP;cell.ramp=null;cell.obst=null;}}
 const cleared=new Set();for(const body of G.generatedBodies||[])if(['tree','rock'].includes(body.source)&&Math.abs(body.x-site.pos.x)<radius*CELL+CELL/2&&Math.abs(body.z-site.pos.z)<radius*CELL+CELL/2){body.depleted=true;cleared.add(Math.round(body.x*100)+','+Math.round(body.z*100));for(const part of body.draw||[]){part.mesh.setMatrixAt(part.index,new THREE.Matrix4().makeScale(0,0,0));part.mesh.instanceMatrix.needsUpdate=true;}}economy().nodes=economy().nodes.filter(n=>!cleared.has(n.id));G.groundCenter=null;
 }return groundedLandmarkVisual(site);};
