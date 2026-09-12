/* eslint-disable typescript/no-require-imports -- The game harness uses CommonJS. */
process.env.GAME_PLATEAUS = '1';
process.env.GAME_SCALE = '2';
const { api: a, assert } = require('./combat-harness.cjs');

a.newRun('ranger', 'PACE-QA');
const g = a.getG(),
  root = g.terrain,
  origin = g.player.pos.clone();
const initialChunks = new Map(root.userData.chunks);
g.player.pos.x += 100;
a.streamPlateauTerrain(0);
assert(g.terrainChunkJob, 'An exhausted frame budget leaves a resumable patch');
assert.equal(root.userData.chunks.size, initialChunks.size);
const first = g.terrainChunkJob;
a.streamPlateauTerrain(0);
assert.equal(g.terrainChunkJob, first, 'The next frame resumes the same patch');
assert.equal(
  root.userData.chunks.size,
  initialChunks.size,
  'Partial geometry stays hidden',
);
assert.equal(
  g.terrainBuildBounds,
  undefined,
  'Temporary build bounds never leak between frames',
);
assert.equal(g.terrain, root);
assert(!JSON.stringify(a.snapshot()).includes('terrainChunkJob'));

g.player.pos.copy(origin);
g.player.pos.x -= 150;
a.streamPlateauTerrain(0);
assert.notEqual(
  g.terrainChunkJob,
  first,
  'A teleport cancels an obsolete patch',
);
const times = [];
for (let i = 0; i < 2000; i++) {
  const start = performance.now();
  a.streamPlateauTerrain();
  times.push(performance.now() - start);
  if (
    !g.terrainChunkJob &&
    !g.terrainQueue.length &&
    g.groundCenter.equals(g.player.pos)
  )
    break;
}
assert(!g.terrainChunkJob && !g.terrainQueue.length, 'Streaming finishes');
assert(g.groundCenter.equals(g.player.pos));
assert(root.userData.chunks.size <= 121);
assert.equal(g.terrain, root);
assert(
  [...initialChunks].some(
    ([key, mesh]) => root.userData.chunks.get(key) === mesh,
  ),
);
console.log(
  'PASS incremental terrain, hidden partial patches, teleport cancellation and save isolation',
);
console.log('Terrain streaming CPU milliseconds:', {
  max: Math.max(...times),
  calls: times.length,
});

a.installCombat();
g.uiNext = 0;
a.updateCombatUI();
const button = a.node('ability0'),
  toggle = button.classList.toggle;
let mutations = 0;
button.classList.toggle = (...args) => {
  mutations++;
  return toggle(...args);
};
for (let i = 0; i < 20; i++) a.updateCombatUI();
assert.equal(mutations, 0, 'Every HUD extension respects the refresh interval');
g.time += 0.08;
a.updateCombatUI();
assert(mutations > 0, 'HUD updates after the interval');
mutations = 0;
g.uiNext = 0;
a.updateCombatUI();
assert(mutations > 0, 'Input-triggered refreshes remain immediate');
console.log('PASS full HUD throttling and immediate refresh');
