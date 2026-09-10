/* Gameplay rays use the same terrain and footprints as movement, never foliage. */
function physicalRay(a,b,ignore=null,terrainOnly=false){
 const delta=b.clone().sub(a),length=delta.length();if(length<.00001)return null;const dir=delta.clone().divideScalar(length),ray=new THREE.Ray(a,dir);let nearest=length+.001,point=null;
 if(!terrainOnly){const bodies=new Set(),steps=Math.max(1,Math.ceil(length/3));for(let i=0;i<=steps;i++){const t=i/steps;for(const body of nearbyBodies(a.x+delta.x*t,a.z+delta.z*t,1.3))bodies.add(body);}
 for(const body of bodies){if(body.depleted||body.source?.taken)continue;const source=body.source;if(ignore&&(source===ignore||source?.mesh===ignore||source?.coreMesh===ignore||body.postMesh===ignore))continue;let hit;
 if(body.hx!==undefined){const box=new THREE.Box3(V3(body.x-body.hx,body.y,body.z-body.hz),V3(body.x+body.hx,body.y+body.h,body.z+body.hz));hit=ray.intersectBox(box,V3());}
 else{const r=body.r||.1,ox=a.x-body.x,oz=a.z-body.z,qa=dir.x*dir.x+dir.z*dir.z,qb=2*(ox*dir.x+oz*dir.z),qc=ox*ox+oz*oz-r*r,candidates=[];
 if(qa>1e-9){const disc=qb*qb-4*qa*qc;if(disc>=0){const root=Math.sqrt(disc);candidates.push((-qb-root)/(2*qa),(-qb+root)/(2*qa));}}
 if(Math.abs(dir.y)>1e-9)for(const y of [body.y,body.y+body.h]){const t=(y-a.y)/dir.y;if(Math.hypot(a.x+dir.x*t-body.x,a.z+dir.z*t-body.z)<=r)candidates.push(t);}
 for(const t of candidates.sort((x,y)=>x-y))if(t>=0&&a.y+dir.y*t>=body.y-.001&&a.y+dir.y*t<=body.y+body.h+.001){hit=ray.at(t,V3());break;}}
 if(hit){const distance=hit.distanceTo(a);if(distance<nearest){nearest=distance;point=hit;}}
 }}
 const end=Math.min(length,nearest),steps=Math.max(1,Math.ceil(end/.4));let last=0;
 for(let i=0;i<=steps;i++){const t=end*i/steps,x=a.x+dir.x*t,z=a.z+dir.z*t,y=a.y+dir.y*t;if(Math.abs(x)>=WORLD*CELL/2||Math.abs(z)>=WORLD*CELL/2){last=t;continue;}if(y<heightAt(x,z)||rockyCliffSolid(x,y,z)){let lo=last,hi=t;for(let k=0;k<10;k++){const mid=(lo+hi)/2;if(a.y+dir.y*mid<heightAt(a.x+dir.x*mid,a.z+dir.z*mid)||rockyCliffSolid(a.x+dir.x*mid,a.y+dir.y*mid,a.z+dir.z*mid))hi=mid;else lo=mid;}if(hi<nearest)point=ray.at(hi,V3());break;}last=t;}
 return point;
}
projectileObstacle=function(a,b,ignoreMesh=null){return physicalRay(a,b,ignoreMesh);};
groundHit=function(){if(!G||!raycaster)return null;return physicalRay(raycaster.ray.origin,raycaster.ray.at(250,V3()),null,true);};
sceneAim=function(pointer=false){
 if(!G||!raycaster)return {point:V3(),enemy:null};const usePointer=pointer||G.view==='top',signature=[G.time,usePointer,mouse.x,mouse.y,G.view,G.cameraYaw,G.cameraPitch,G.player.pos.x,G.player.pos.y,G.player.pos.z].join('/');if(G.fastAim?.signature===signature)return G.fastAim.result;
 updateCamera();camera.updateMatrixWorld();raycaster.setFromCamera(usePointer?mouse:{x:0,y:0},camera);const origin=raycaster.ray.origin,end=raycaster.ray.at(120,V3());let point=physicalRay(origin,end)||end,enemy=null,distance=point.distanceTo(origin);
 for(const e of G.enemies){if(e.dead)continue;const hit=raycaster.ray.intersectSphere(new THREE.Sphere(e.pos.clone().add(V3(0,e.d.size,0)),e.d.size+.12),V3());if(hit&&hit.distanceTo(origin)<distance){distance=hit.distanceTo(origin);point=hit;enemy=e;}}
 const result={point,enemy};G.fastAim={signature,result};return result;
};
// Move a grounded capsule along the slope, updating its feet after every substep.
const beforeSlopeMove=tryMove;
tryMove=function(pos,dx,dz){
 if(pos!==G.player.pos||G.player.vy>0||Math.abs(pos.y-heightAt(pos.x,pos.z))>.12)return beforeSlopeMove(pos,dx,dz);
 const count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.16));
 const move=(mx,mz)=>{const x=pos.x+mx,z=pos.z+mz,floor=heightAt(x,z),rise=floor-pos.y;if(rise>Math.hypot(mx,mz)*.8+.025)return false;const y=rise>=-.25?floor:pos.y;if(blockedAt(x,z,y,.35,1.65,G.player))return false;if(pendingWall&&wallCrossing(...worldToCell(pos),...worldToCell(V3(x,y,z))))return false;pos.set(x,y,z);return true;};
 for(let i=0;i<count;i++)if(!move(dx/count,dz/count)){move(dx/count,0);move(0,dz/count);}
};
// Reuse a clear line to the goal for a short interval instead of tracing it per enemy per frame.
const expensiveEnemySegment=walkSegment;let checkingEnemyRoute=false;
walkSegment=function(a,b,...rest){if(checkingEnemyRoute&&a===checkingEnemyRoute.enemy.pos&&b===checkingEnemyRoute.goal&&rest[2]!==true){const e=checkingEnemyRoute.enemy,c=e.segmentCheck;if(c&&c.until>G.time&&c.revision===navRevision&&c.goal.distanceToSquared(b)<1&&c.start.distanceToSquared(a)<2.25)return c.open;const open=expensiveEnemySegment(a,b,...rest);e.segmentCheck={until:G.time+.2,revision:navRevision,goal:b.clone(),start:a.clone(),open};return open;}return expensiveEnemySegment(a,b,...rest);};
const routedEnemyAdvance=enemyAdvance;enemyAdvance=function(e,...args){checkingEnemyRoute={enemy:e,goal:args[0]};try{return routedEnemyAdvance(e,...args);}finally{checkingEnemyRoute=false;}};

// Strategic navigation should try neighboring tiles, not run thousands of fine-grid
// searches inside every edge of the strategic graph.
tileEdge=function(ax,az,bx,bz,r){
 if(!inGrid(bx,bz)||!stepOk(ax,az,bx,bz))return null;const id=[ax,az,bx,bz,r,G.site?.id||0].join('/');if(navEdges.has(id))return navEdges.get(id);
 const a=tileAnchor(ax,az,r),b=tileAnchor(bx,bz,r);let path=null;
 if(a&&b){if(walkSegment(a,b,r,'nav'))path=[b.clone()];else{const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);for(const offset of [r+.7,-r-.7,2.8,-2.8]){const mid=V3((a.x+b.x)/2-dz/len*offset,0,(a.z+b.z)/2+dx/len*offset);mid.y=heightAt(mid.x,mid.z);if(walkSegment(a,mid,r,'nav')&&walkSegment(mid,b,r,'nav')){path=[mid,b.clone()];break;}}}}
 navEdges.set(id,path);return path;
};

function climbContact(){
 const p=G.player,dir=p.climbing?.dir||cameraForward(),q=p.pos.clone().addScaledVector(dir,.68),terrain=heightAt(q.x,q.z);
 if(inGrid(...worldToCell(q))&&terrain>p.pos.y+.65)return {dir,top:terrain,terrain:true};
 for(const b of nearbyBodies(q.x,q.z,.3)){if(b.depleted||b.walkable||b.h<1.4||b.hx===undefined||b.source?.open)continue;if(p.pos.y>b.y+b.h-.2||p.pos.y+1.5<b.y)continue;if(overlapsBody(b,q.x,q.z,.25))return {dir,top:b.y+b.h,body:b};}
 return null;
}
function beginClimb(){const p=G.player;if(p.dead>0||G.buildMode||p.climbExhausted||G.time<(p.climbDelay||0)||(p.stamina??100)<=3)return false;const contact=climbContact();if(!contact)return false;p.climbing=contact;p.vy=0;return true;}
const climbingJump=jumpPlayer;jumpPlayer=function(){if(!G)return;if(G.player.climbing)return;if(beginClimb())return;climbingJump();};
function endClimb(exhausted=false){const p=G.player;p.climbing=null;p.climbDelay=G.time+.4;p.climbExhausted=exhausted;p.staminaRestAt=G.time+.8;}
function advanceClimb(dt){
 const p=G.player;p.stamina??=100;
 if(p.climbing){
  if(!keys.Space||p.dead>0||G.buildMode){endClimb();return;}
  const contact=climbContact()||p.climbing,dir=p.climbing.dir,up=keys.KeyW?1:keys.KeyS?-1:0,side=(keys.KeyA?1:0)-(keys.KeyD?1:0),fast=keys.ShiftLeft||keys.ShiftRight;
  p.stamina=Math.max(0,p.stamina-dt*(up||side?fast?32:18:4));
  if(p.stamina<=0){endClimb(true);return;}
  const next=p.pos.clone();next.y+=up*(fast?3.4:2.1)*dt;next.x+=dir.z*side*dt*1.4;next.z-=dir.x*side*dt*1.4;
  if(next.y>=contact.top-.15&&up>0){const landing=next.clone().addScaledVector(dir,1.4);landing.y=Math.max(contact.top,heightAt(landing.x,landing.z));if(!blockedAt(landing.x,landing.z,landing.y,.35,1.65,p)){p.pos.copy(landing);p.vy=0;endClimb();}return;}
  if(next.y<=heightAt(next.x,next.z)+.03){p.pos.y=heightAt(next.x,next.z);endClimb();return;}
  const probe=next.clone().addScaledVector(dir,.68),supported=contact.body?overlapsBody(contact.body,probe.x,probe.z,.25)&&next.y<contact.top:heightAt(probe.x,probe.z)>next.y+.15;
  if(supported&&!blockedAt(next.x,next.z,next.y,.32,1.6,p))p.pos.copy(next);p.vy=0;p.yaw=Math.atan2(dir.x,dir.z);
 }else{
  const floor=supportHeight(p.pos,p.pos.y+.04),grounded=Math.abs(p.pos.y-floor)<.12;
  if(grounded&&G.time>=(p.staminaRestAt||0)){p.stamina=Math.min(100,p.stamina+dt*25);if(p.stamina>25&&!keys.Space)p.climbExhausted=false;}
  if(keys.Space&&keys.KeyW)beginClimb();
 }
}
const climbingPlayer=updatePlayer;
updatePlayer=function(dt){
 const p=G.player,climbing=p.climbing,old=p.pos.clone(),saved={};if(climbing){for(const key of ['KeyW','KeyA','KeyS','KeyD']){saved[key]=keys[key];keys[key]=false;}p.vy=0;}
 climbingPlayer(dt);if(G.player!==p)return;if(climbing){p.pos.copy(old);Object.assign(keys,saved);}advanceClimb(Math.min(dt,.05));G.playerMesh.position.copy(p.pos);
 if(p.climbing){const parts=G.playerMesh.userData.voxelParts;if(parts){parts.armL.rotation.x=-2.5+Math.sin(G.time*6)*.3;parts.armR.rotation.x=-2.5-Math.sin(G.time*6)*.3;parts.legL.rotation.x=.4+Math.sin(G.time*6)*.25;parts.legR.rotation.x=.4-Math.sin(G.time*6)*.25;}}
 const hud=$('climbStamina');if(hud){hud.style.display=p.climbing||p.stamina<99.5?'block':'none';hud.querySelector('progress').value=p.stamina??100;hud.querySelector('span').textContent=p.climbing?'Climbing · release Space to drop':p.climbExhausted?'Exhausted · rest on the ground':'Stamina';}
};
const climbingInstall=installIntegration;installIntegration=function(){climbingInstall();const el=document.createElement('div');el.id='climbStamina';el.style.cssText='display:none;position:fixed;left:50%;top:64%;transform:translateX(-50%);color:#e6eddb;font:13px sans-serif;text-shadow:0 1px 3px #000;pointer-events:none;z-index:30;text-align:center';el.innerHTML='<span>Stamina</span><br><progress max="100" value="100" style="width:150px;height:12px;accent-color:#96cb62"></progress>';document.body.appendChild(el);$('help').insertAdjacentHTML?.('beforeend','<div>Hold Space + W at a wall: climb · A/D traverse · S descend · Shift climb faster · release Space: drop</div>');};
// Contacts and ray caches are transient; a loaded airborne player resumes falling.
const safeClimbPack=pack;pack=function(value){if(value===G?.player){const {climbing,...rest}=value;return safeClimbPack(rest);}return safeClimbPack(value);};

// Distant voxel actors use one baked mesh; nearby actors retain their articulated rig.
const distantVoxelGeometry=new Map(),distantVoxelMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
function farVoxelModel(model){
 const key=model.userData.recipe;if(!distantVoxelGeometry.has(key)){model.updateMatrixWorld(true);const inv=model.matrixWorld.clone().invert(),positions=[],normals=[],colors=[];
 for(const root of model.children){if(!model.userData.parts.includes(root))continue;root.traverse(o=>{if(!o.isMesh)return;const transform=inv.clone().multiply(o.matrixWorld),normalMatrix=new THREE.Matrix3().getNormalMatrix(transform),geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry,p=geo.attributes.position,n=geo.attributes.normal,c=geo.attributes.color,base=o.material.color||new THREE.Color(1,1,1);for(let i=0;i<p.count;i++){const v=V3(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(transform),normal=V3(n.getX(i),n.getY(i),n.getZ(i)).applyMatrix3(normalMatrix).normalize();positions.push(v.x,v.y,v.z);normals.push(normal.x,normal.y,normal.z);colors.push((c?.getX(i)??1)*base.r,(c?.getY(i)??1)*base.g,(c?.getZ(i)??1)*base.b);}if(geo!==o.geometry)geo.dispose();});}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));distantVoxelGeometry.set(key,g);}
 const mesh=new THREE.Mesh(distantVoxelGeometry.get(key),distantVoxelMaterial);model.add(mesh);model.userData.farMesh=mesh;return mesh;
}
const lodVoxelAnimation=animateVoxelActor;
animateVoxelActor=function(actor,dt){const model=actor.mesh;if(!model?.userData.voxelParts)return lodVoxelAnimation(actor,dt);const far=actor.pos.distanceToSquared(G.player.pos)>35*35,mesh=model.userData.farMesh||(far?farVoxelModel(model):null);if(mesh)mesh.visible=far;for(const part of model.userData.parts)part.visible=!far;if(!far)lodVoxelAnimation(actor,dt);};
const efficientRenderer=initThree;initThree=function(){efficientRenderer();renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));sun.shadow.mapSize.set(1024,1024);};

function rockyCliffSolid(x,y,z){
 if(!plateauMode())return false;const cx=Math.round(x/CELL+HALF),cz=Math.round(z/CELL+HALF),centerX=(cx-HALF)*CELL,centerZ=(cz-HALF)*CELL,half=CELL/2;
 for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const distance=half-(x-centerX)*dx-(z-centerZ)*dz;if(distance<0||distance>.31||!cellAt(cx+dx,cz+dz))continue;const bx=dx?centerX+dx*half:x,bz=dz?centerZ+dz*half:z,low=plateauSurface(cx,cz,bx,bz),high=plateauSurface(cx+dx,cz+dz,bx,bz);if(high<=low+.15||y<=low||y>=high)continue;const t=(y-low)/(high-low),along=dx?(bz-centerZ+half)/CELL:(bx-centerX+half)/CELL,offset=Math.sin(Math.PI*t)*Math.sin(Math.PI*clamp(along,0,1))*(.08+.22*(.5+.5*Math.sin(y*2.1+(bx+bz)*.8)));if(distance<offset)return true;
 }return false;
}
const rockyCapsule=blockedAt;blockedAt=function(x,z,y,r=.35,h=1.65,...args){if(rockyCapsule(x,z,y,r,h,...args))return true;for(let i=0;i<8;i++){const a=i*Math.PI/4,px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;if(rockyCliffSolid(px,y+.3,pz)||rockyCliffSolid(px,y+h*.8,pz))return true;}return false;};

const climbingInput=bindInput;bindInput=function(){climbingInput();addEventListener('keyup',e=>{if(e.code==='Space'&&G?.player?.climbing)endClimb();});addEventListener('keydown',e=>{if(e.code==='Escape'&&G?.player?.climbing)endClimb();});};
