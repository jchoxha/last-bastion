/* Validated Chimera definitions reuse the existing per-run species/save registry. */
const forgeDefinitions = new Map();
const forgeModels = new Map();
const forgeLastPositions = new WeakMap();
const forgeRecipeBase = registerCreatureRecipe;
registerCreatureRecipe = function (id, spec, remember = true) {
  if (!spec.forge && !spec.forgeJson)
    return forgeRecipeBase(id, spec, remember);
  if (!bridge.creatures) throw Error('Creature forge runtime is unavailable.');
  const creature = spec.forgeJson
    ? bridge.creatures.parseCreature(spec.forgeJson)
    : bridge.creatures.makeCreature(spec.forge.spec);
  if (creature.id !== id || creature.assets.model !== 'prototype')
    throw Error('Invalid saved creature or unsupported rig.');
  const normalized = {
    base: 'grunt',
    name: creature.spec.name,
    hp: creature.stats.hp,
    speed: creature.stats.speed,
    color: parseInt(creature.spec.color.slice(1), 16),
    // The legacy packer strips keys such as "bodies" recursively as render caches.
    // Keep the validated definition in a bounded JSON envelope across that boundary.
    forgeJson: JSON.stringify(creature),
  };
  const result = forgeRecipeBase(id, normalized, remember);
  ENEMIES[id].dmg = creature.stats.damage;
  ENEMIES[id].size = creature.stats.radius;
  ENEMIES[id].gold = 0; // Testing creatures never becomes a gold-generation shortcut.
  forgeDefinitions.set(id, creature);
  return result;
};
const forgeSpawnBase = spawnEnemy;
spawnEnemy = function (type, gate, scale) {
  const enemy = forgeSpawnBase(type, gate, scale),
    definition = forgeDefinitions.get(type);
  if (!enemy || !definition) return enemy;
  const old = enemy.mesh,
    actor = bridge.creatures.createCreatureActor(definition);
  old.remove(enemy.hb);
  actor.group.add(enemy.hb);
  enemy.hb.position.set(0, 2.3, 0);
  actor.group.position.copy(enemy.pos);
  G.world.remove(old);
  G.world.add(actor.group);
  // Voxel materials and cloned limb geometries are private; cached base geometry is shared.
  old.traverse((object) => {
    if (object.isMesh) {
      if (!Array.from(voxelCache.values()).includes(object.geometry))
        object.geometry.dispose();
      object.material?.dispose();
    }
  });
  enemy.mesh = actor.group;
  enemy.body = actor.mesh;
  forgeModels.set(actor.group, actor);
  return enemy;
};
const forgeAnimateBase = animateVoxelActor;
animateVoxelActor = function (actor, dt) {
  const rig = forgeModels.get(actor.mesh);
  if (!rig) return forgeAnimateBase(actor, dt);
  const previous = forgeLastPositions.get(actor);
  const moving = previous && actor.pos.distanceToSquared(previous) > 0.00001;
  if (previous) previous.copy(actor.pos);
  else forgeLastPositions.set(actor, actor.pos.clone());
  rig.setAnimation(moving ? 'walk' : 'idle');
  rig.update(dt);
};
const forgeUpdateBase = updatePlayer;
updatePlayer = function (dt) {
  forgeUpdateBase(dt);
  for (const [model, actor] of forgeModels) {
    if (model.parent !== G.world) {
      actor.dispose();
      forgeModels.delete(model);
    }
  }
};
const forgeDiscardBase = discardWorld;
discardWorld = function () {
  for (const actor of forgeModels.values()) actor.dispose();
  forgeModels.clear();
  return forgeDiscardBase();
};
window.bastion.spawnForgedCreature = function (value) {
  if (!G?.player || !bridge.creatures)
    throw Error('Choose a class and start a run first.');
  if (G.player.hp <= 0)
    throw Error('Recover your character before testing an enemy.');
  const creature = bridge.creatures.makeCreature(value.spec);
  if (creature.assets.model !== 'prototype')
    throw Error('This body plan is not ready for spawning.');
  const species = (colony().species ??= {});
  if (!species[creature.id] && Object.keys(species).length >= 64)
    throw Error('This run has reached its 64 custom-species limit.');
  const position = G.player.pos.clone().addScaledVector(cameraForward(), 9);
  position.y = heightAt(position.x, position.z);
  if (noSpawnAt(position))
    throw Error(
      'Move outside the protected settlement before testing an enemy.',
    );
  if (!ENEMIES[creature.id])
    registerCreatureRecipe(creature.id, { forge: creature }, false);
  else if (!forgeDefinitions.has(creature.id))
    throw Error('Creature identifier is already in use.');
  const enemy = frontierSpawnAt(position, creature.id);
  if (!enemy)
    throw Error(
      'No clear spawn position, or the enemy limit was reached. Move into open terrain.',
    );
  species[creature.id] = {
    base: 'grunt',
    name: creature.spec.name,
    hp: creature.stats.hp,
    speed: creature.stats.speed,
    color: parseInt(creature.spec.color.slice(1), 16),
    forgeJson: JSON.stringify(creature),
  };
  return (
    creature.spec.name +
    ' spawned as a hostile test enemy. Resume the run when ready.'
  );
};
