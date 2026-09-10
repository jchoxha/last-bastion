/* Strategic routes use the original tile centers; physical travel uses the same
   whole-world ramp graph with local footprint detours, not a small search box. */
let navRevision=0,navEdges=new Map(),navAnchors=new Map();
const invalidateNavigation=rebuildCollision;
rebuildCollision=function(){invalidateNavigation();navRevision++;navEdges.clear();navAnchors.clear();};
function tilePoint(x,z){const p=cellToWorld(x,z);p.y=heightAt(p.x,p.z);return p;}
function tileAnchor(x,z,r){const id=x+','+z+'/'+r+'/'+(G.site?.id||0);if(navAnchors.has(id))return navAnchors.get(id);const center=tilePoint(x,z);let answer=null;for(const distance of [0,CELL*.18,CELL*.32,CELL*.46]){for(let i=0;i<(distance?16:1);i++){const p=center.clone().add(V3(Math.cos(i*Math.PI/8)*distance,0,Math.sin(i*Math.PI/8)*distance));p.y=heightAt(p.x,p.z);if(!blockedAt(p.x,p.z,p.y,r,1.6,'nav')){answer=p;break;}}if(answer)break;}navAnchors.set(id,answer);return answer;}
function tileEdge(ax,az,bx,bz,r){if(!inGrid(bx,bz)||!stepOk(ax,az,bx,bz))return null;const id=[ax,az,bx,bz,r,G.site?.id||0].join('/');if(navEdges.has(id))return navEdges.get(id);const a=tileAnchor(ax,az,r),b=tileAnchor(bx,bz,r);let path=null;if(a&&b){if(walkSegment(a,b,r,'nav'))path=[b.clone()];else{const local=localRoute(a,b,r);if(local.length&&walkSegment(local.at(-1),b,r,'nav'))path=[...local,b.clone()];}}navEdges.set(id,path);return path;}
function gridPlan(from,to,r=.45){const start=worldToCell(from),end=worldToCell(to);if(!inGrid(...start)||!inGrid(...end))return null;const keyOf=(x,z)=>z*WORLD+x,first=keyOf(...start),last=keyOf(...end),cost=new Map([[first,0]]),parent=new Map(),closed=new Set(),queue=new NavHeap();queue.push(first,0);let found=false;
 while(queue.length){const [id]=queue.pop();if(closed.has(id))continue;if(id===last){found=true;break;}closed.add(id);const x=id%WORLD,z=Math.floor(id/WORLD);for(const [dx,dz,w]of NBRS8){const nx=x+dx,nz=z+dz,j=keyOf(nx,nz);if(!inGrid(nx,nz)||closed.has(j)||!tileEdge(x,z,nx,nz,r))continue;const weight=1+((hashStr(G.seed+'/road/'+(nx-HALF)+'/'+(nz-HALF))>>>0)%1000)/1666,score=cost.get(id)+w*weight;if(score<(cost.get(j)??Infinity)){cost.set(j,score);parent.set(j,id);queue.push(j,score+Math.hypot(nx-end[0],nz-end[1]));}}}
 if(!found)return null;const cells=[];for(let id=last;;id=parent.get(id)){cells.unshift([id%WORLD,Math.floor(id/WORLD)]);if(id===first)break;if(id===undefined)return null;}
 const path=[],anchor=tileAnchor(...start,r);if(!anchor)return null;if(from.distanceTo(anchor)>.15){if(walkSegment(from,anchor,r,'nav'))path.push(anchor.clone());else{const local=localRoute(from,anchor,r);if(!local.length||!walkSegment(local.at(-1),anchor,r,'nav'))return null;path.push(...local,anchor.clone());}}
 for(let i=1;i<cells.length;i++)path.push(...tileEdge(...cells[i-1],...cells[i],r).map(p=>p.clone()));if(!path.length)path.push(anchor.clone());if(walkSegment(path.at(-1),to,r,'nav'))path.push(to.clone());return {cells,path};}
greedyRoute=function(from){const plan=gridPlan(tilePoint(...from),G.site.corePos,1.26);return plan?plan.cells.map(c=>tilePoint(...c).add(V3(0,.12,0))):[];};
// Keep the inexpensive preview / fine clearance check; only the red route is strategic.
const gridRefresh=refreshRoutes;
refreshRoutes=function(){gridRefresh();for(const e of G.enemies){e.travelPlan=null;e.planRevision=-1;}};
pickNext=function(e){if(!G.site)return;const routes=G.site.routes||[],route=routes[(e.routeId||0)%Math.max(1,routes.length)];let destination=G.site.corePos;if(route?.length){e.routeCursor=clamp(e.routeCursor||0,0,route.length-1);const waypoint=i=>tileAnchor(...worldToCell(route[i]),e.d.size)||route[i];while(e.routeCursor<route.length-1&&e.pos.distanceTo(waypoint(e.routeCursor))<.7)e.routeCursor++;destination=waypoint(e.routeCursor);}
 if(e.travelPlan?.length&&e.planRevision===navRevision){while(e.travelPlan.length&&e.pos.distanceTo(e.travelPlan[0])<.25)e.travelPlan.shift();}else e.travelPlan=null;
 if(!e.travelPlan?.length){const plan=walkSegment(e.pos,destination,e.d.size,'nav')?{path:[destination.clone()]}:gridPlan(e.pos,destination,e.d.size);e.travelPlan=plan?.path||[];e.planRevision=navRevision;if(!e.travelPlan.length&&destination!==G.site.corePos){const corePlan=gridPlan(e.pos,G.site.corePos,e.d.size);e.travelPlan=corePlan?.path||[];}}
 if(e.travelPlan.length){e.target=e.travelPlan[0].clone();e.next=worldToCell(e.target);}else e.next=null;};
const rampEnemyPhysics=updateEnemyPhysics;
updateEnemyPhysics=function(e,dt){const airborne=rampEnemyPhysics(e,dt);if(airborne){e.travelPlan=null;e.planRevision=-1;}return airborne;};
const rampEnemies=updateEnemies;
updateEnemies=function(dt){for(const e of G.enemies)if(e.target&&Math.hypot(e.target.x-e.pos.x,e.target.z-e.pos.z)<.3)e.next=null;rampEnemies(dt);for(const e of G.enemies){if(e.dead)continue;if(e.recoveryPos&&e.pos.distanceToSquared(e.recoveryPos)<.0025)e.recoveryStall=(e.recoveryStall||0)+dt;else{e.recoveryPos=e.pos.clone();e.recoveryStall=0;}if(e.recoveryStall>.8){e.travelPlan=null;e.next=null;e.planRevision=-1;e.recoveryStall=0;}}};
// NPC commands can use ramps anywhere on the generated map as well.
function commandPath(from,to,r=.27){if(walkSegment(from,to,r,'nav'))return [to.clone()];return gridPlan(from,to,r)?.path||[];}
