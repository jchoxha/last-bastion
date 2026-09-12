/* Keep the strategic plateau topology. Only the rim profile and surface detail change. */
const plateauMode=()=>RUN_SETTINGS.terrainMode==='plateaus';
function plateauRaw(cx,cz,x,z){
 const c=cellAt(cx,cz);if(!c)return 0;
 if(!c.ramp)return c.lvl*LSTEP;
 let t=clamp(.5+c.ramp[0]*(x/CELL+HALF-cx)+c.ramp[1]*(z/CELL+HALF-cz),0,1);
 // Ease the foot and crest without changing either landing height.
 const e=.08;t=t<e?t*t/(2*e*(1-e)):t>1-e?1-(1-t)*(1-t)/(2*e*(1-e)):(t-e/2)/(1-e);
 return (c.lvl+t)*LSTEP;
}
function plateauVariation(x,z){
 let weight=1;if(G.preparingPlateauBase&&Math.max(Math.abs(x-G.preparingPlateauBase.x),Math.abs(z-G.preparingPlateauBase.z))<CELL*3.5)return 0;
 for(const site of G.sites||[])weight=Math.min(weight,clamp((Math.max(Math.abs(x-site.corePos.x),Math.abs(z-site.corePos.z))-CELL*3.5)/(CELL*1.5),0,1));
 // Broad, low amplitude relief: centimetres of uneven ground, not a new hill system.
 const seed=G.terrainNoiseSeed??=(hashStr(G.seed)>>>0)%1000;
 return weight*(Math.sin(x*.11+seed)*Math.cos(z*.095-seed)*.11+Math.sin(x*.047+z*.071+seed)*.07);
}
function plateauSurface(cx,cz,x,z){
 const c=cellAt(cx,cz);if(!c)return 0;
 const center={x:(cx-HALF)*CELL,z:(cz-HALF)*CELL},half=CELL/2,rim=CELL*.075,raw=plateauRaw(cx,cz,x,z);let flatWeight=1,toe=0;
 for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
  const d=half-(x-center.x)*dx-(z-center.z)*dz;if(d>rim||!cellAt(cx+dx,cz+dz))continue;
  const bx=dx?center.x+dx*half:x,bz=dz?center.z+dz*half:z;
  const gap=plateauRaw(cx,cz,bx,bz)-plateauRaw(cx+dx,cz+dz,bx,bz);
  const brokenRim=rim*(.82+.18*Math.sin((x+z)*1.7)),round=Math.pow(1-clamp(d/brokenRim,0,1),2);
  if(gap>.15)flatWeight*=1-round*clamp((gap-.15)/.5,0,1);
  else if(gap<-.15)toe=Math.max(toe,round*clamp((-gap-.15)/.5,0,1)*rim*.18);
 }
 return raw-rim*.45*(1-flatWeight)+toe+plateauVariation(x,z);
}
const beforeRoundedHeight=heightAt;
heightAt=function(x,z){
 if(!plateauMode()||!G?.cells)return beforeRoundedHeight(x,z);
 const cx=Math.round(x/CELL+HALF),cz=Math.round(z/CELL+HALF);let h=plateauSurface(cx,cz,x,z);
 for(const t of G.stairs||[]){const y=stairSurface(t,x,z);if(y!==null)h=y;}
 return h;
};
const beforeRoundedPassage=terrainPassable;
terrainPassable=function(...args){return plateauMode()?oldTerrainPassable(...args):beforeRoundedPassage(...args);};
function plateauClearing(pos,radius=2){
 const [cx,cz]=worldToCell(pos),c=cellAt(cx,cz);if(!c||c.ramp)return false;
 for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++){const n=cellAt(cx+dx,cz+dz);if(!n||n.ramp||n.lvl!==c.lvl)return false;}return true;
}
const roundedTerrainFallback=buildTerrainMesh;
function* plateauPatchSteps(){
 const p=G.player?.pos||V3(),[px,pz]=worldToCell(p),radius=17,half=CELL/2,rim=CELL*.075;
 const offsets=[-half,-half+rim/3,-half+rim,-CELL/4,0,CELL/4,half-rim,half-rim/3,half],n=offsets.length;
 const vertices=[],uv=[],colors=[],top=[],walls=[],tileCache=G.plateauTiles??=new Map();while(tileCache.size>4096)tileCache.delete(tileCache.keys().next().value);
 const colorFor=(x,z)=>new THREE.Color(({meadow:0x839861,wetland:0x647e57,desert:0xb8a075,frost:0xb9c7bf})[biomeAt(x,z)]);
 const vertex=(x,y,z,color,wall=false)=>{const i=vertices.length/3;vertices.push(x,y,z);colors.push(color.r,color.g,color.b);uv.push((x+z)*.2,(wall?y:z)*.2);return i;};
 const bounds=G.terrainBuildBounds||[px-radius,px+radius,pz-radius,pz+radius];
 for(let cx=Math.max(0,bounds[0]);cx<=Math.min(WORLD-1,bounds[1]);cx++)for(let cz=Math.max(0,bounds[2]);cz<=Math.min(WORLD-1,bounds[3]);cz++){
  // Streaming callers can yield between tiles, before the next expensive patch.
  yield;
  const start=vertices.length/3,topStart=top.length,wallStart=walls.length,neighborhood=[];
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const c=cellAt(cx+dx,cz+dz);neighborhood.push(c?c.lvl+':'+(c.ramp?.join(',')||''):'edge');}
  const tileKey=[cx-HALF,cz-HALF,G.sites?.length||0,...neighborhood].join('/'),cached=tileCache.get(tileKey);
  if(cached){vertices.push(...cached.vertices);colors.push(...cached.colors);uv.push(...cached.uv);top.push(...cached.top.map(i=>i+start));walls.push(...cached.walls.map(i=>i+start));continue;}
  const center=cellToWorld(cx,cz);
  for(const dz of offsets)for(const dx of offsets){const x=center.x+dx,z=center.z+dz;vertex(x,plateauSurface(cx,cz,x,z),z,colorFor(x,z));}
  for(let z=0;z<n-1;z++)for(let x=0;x<n-1;x++){const a=start+z*n+x;top.push(a,a+n,a+1,a+1,a+n,a+n+1);}
  for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){
   if(!cellAt(cx+dx,cz+dz))continue;
   for(let i=0;i<n-1;i++){
    const ax=center.x+(dx?dx*half:offsets[i]),az=center.z+(dz?dz*half:offsets[i]),bx=center.x+(dx?dx*half:offsets[i+1]),bz=center.z+(dz?dz*half:offsets[i+1]);
    const ah=plateauSurface(cx,cz,ax,az),bh=plateauSurface(cx,cz,bx,bz),al=plateauSurface(cx+dx,cz+dz,ax,az),bl=plateauSurface(cx+dx,cz+dz,bx,bz);
    if(ah<=al+.001&&bh<=bl+.001)continue;
    const lowA=Math.min(ah,al),lowB=Math.min(bh,bl),bands=Math.max(2,Math.min(8,Math.ceil(Math.max(ah-lowA,bh-lowB)/1.8)));
    const cliffVertex=(x,z,low,high,t)=>{const y=low+(high-low)*t,along=dx?(z-center.z+half)/CELL:(x-center.x+half)/CELL,edge=Math.sin(Math.PI*clamp(along,0,1)),offset=Math.sin(Math.PI*t)*edge*(.08+.22*(.5+.5*Math.sin(y*2.1+(x+z)*.8)));const color=new THREE.Color(0x8e9186).multiplyScalar(.78+.22*Math.sin(y*2.4+Math.sin((x+z)*.6))**2);return vertex(x+dx*offset,y,z+dz*offset,color,true);};
    for(let band=0;band<bands;band++){const t0=band/bands,t1=(band+1)/bands,a=cliffVertex(ax,az,lowA,ah,t1),b=cliffVertex(bx,bz,lowB,bh,t1),c=cliffVertex(ax,az,lowA,ah,t0),d=cliffVertex(bx,bz,lowB,bh,t0);walls.push(a,c,b,b,c,d);}
   }
  }
  tileCache.set(tileKey,{vertices:vertices.slice(start*3),colors:colors.slice(start*3),uv:uv.slice(start*2),top:top.slice(topStart).map(i=>i-start),walls:walls.slice(wallStart).map(i=>i-start)});
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex([...top,...walls]);geometry.addGroup(0,top.length,0);geometry.addGroup(top.length,walls.length,1);geometry.computeVertexNormals();
 const material=kind=>new THREE.MeshStandardMaterial({map:terrainTexture(kind),bumpMap:terrainTexture(kind),bumpScale:.035,vertexColors:true,roughness:1,side:THREE.DoubleSide});
 G.terrain=new THREE.Mesh(geometry,[material('grass'),material('rock')]);G.terrain.receiveShadow=true;G.world.add(G.terrain);G.groundCenter=p.clone();return G.terrain;
}
buildTerrainMesh=function(){
 if(!plateauMode())return roundedTerrainFallback();
 const job=plateauPatchSteps();let step;do{step=job.next();}while(!step.done);return step.value;
};
// Initial landmarks also require a real plateau large enough for their footprint.
const plateauWildPoint=randomWildPoint;let choosingPlateauLandmarks=false;
randomWildPoint=function(near=false){if(!plateauMode()||!choosingPlateauLandmarks)return plateauWildPoint(near);for(let i=0;i<20;i++){const p=plateauWildPoint(near);if(p&&plateauClearing(p,2))return p;}return null;};
const plateauLandmarkCreation=createExpeditionLandmarks;
createExpeditionLandmarks=function(){choosingPlateauLandmarks=true;try{return plateauLandmarkCreation();}finally{choosingPlateauLandmarks=false;}};

// Prepare the promised starter courtyard before furnishing it, not afterward.
const plateauProvisionBase=provisionBase;
provisionBase=function(){if(!plateauMode())return plateauProvisionBase();const [cx,cz]=worldToCell(G.player.pos),level=cellAt(cx,cz).lvl;G.preparingPlateauBase=cellToWorld(cx,cz);
 for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){const c=cellAt(cx+dx,cz+dz);if(c){c.lvl=level;c.ramp=null;c.obst=null;}}
 for(const b of G.generatedBodies||[]){const [x,z]=worldToCell(V3(b.x,0,b.z));if(Math.abs(x-cx)>3||Math.abs(z-cz)>3||!['tree','rock'].includes(b.source))continue;b.depleted=true;for(const draw of b.draw||[]){draw.mesh.setMatrixAt(draw.index,new THREE.Matrix4().makeScale(0,0,0));draw.mesh.instanceMatrix.needsUpdate=true;}}
 G.player.pos.y=heightAt(G.player.pos.x,G.player.pos.z);redrawTerrain();try{return plateauProvisionBase();}finally{G.preparingPlateauBase=null;}
};
