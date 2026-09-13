/* Validated Chimera definitions reuse the existing per-run species/save registry. */
const forgeDefinitions = new Map();
const forgeModels = new Map();
const forgeLastPositions = new WeakMap();
const forgeActions = new WeakMap();
const forgeAttacks = new Map();
const forgeCorpses = new Map();
function forgeAction(enemy, name) {
  const rig = forgeModels.get(enemy.mesh);
  if (!rig?.hasAnimation(name)) return false;
  rig.setAnimation(name, true);
  enemy.forgePivoting = false;
  forgeActions.set(enemy, name);
  return true;
}
function steerForgedEnemy(enemy, direction, dt, speed) {
  const rig = forgeModels.get(enemy.mesh);
  if (!rig?.hasAnimation('turn-left')) return 1;
  if (forgeActions.has(enemy)) {
    enemy.forgePivoting = true;
    direction.set(
      Math.sin(enemy.mesh.rotation.y),
      0,
      Math.cos(enemy.mesh.rotation.y),
    );
    return 0;
  }
  const desired = Math.atan2(direction.x, direction.z),
    angle = Math.atan2(
      Math.sin(desired - enemy.mesh.rotation.y),
      Math.cos(desired - enemy.mesh.rotation.y),
    );
  const maxSpeed = rig.turning.maxTurnSpeed;
  const pivot = Math.abs(angle) > 0.85;
  const rate = pivot
    ? maxSpeed
    : Math.min(maxSpeed, Math.max(0.5, speed / rig.turning.minRadius));
  const change = clamp(angle, -rate * dt, rate * dt);
  enemy.mesh.rotation.y += change;
  direction.set(
    Math.sin(enemy.mesh.rotation.y),
    0,
    Math.cos(enemy.mesh.rotation.y),
  );
  enemy.forgePivoting = pivot;
  if (pivot)
    rig.setAnimation(
      Math.abs(angle) > 2.5
        ? 'turn-around'
        : angle > 0
          ? 'turn-right'
          : 'turn-left',
    );
  return pivot ? 0 : Math.max(0.35, Math.cos(angle));
}
function forgedEnemyAttack(enemy, target) {
  const rig = forgeModels.get(enemy.mesh);
  if (!rig?.hasAnimation('attack')) return false;
  const goal = target.corePos || target.pos;
  if (target.b) target.hp ??= 180;
  const desired = Math.atan2(goal.x - enemy.pos.x, goal.z - enemy.pos.z);
  const angle = Math.atan2(
    Math.sin(desired - enemy.mesh.rotation.y),
    Math.cos(desired - enemy.mesh.rotation.y),
  );
  if (Math.abs(angle) > 0.35) {
    enemy.forgeAim = goal.clone();
    enemy.attackCd = 0.05;
    return true;
  }
  if (forgeActions.has(enemy)) {
    enemy.attackCd = 0.05;
    return true;
  }
  delete enemy.forgeAim;
  forgeAction(enemy, 'attack');
  const duration = rig.animationDuration('attack');
  enemy.attackCd = Math.max(1, duration + 0.15);
  forgeAttacks.set(enemy, { target, at: G.time + duration * 0.4 });
  return true;
}
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
// Successful pipeline assets join ordinary wilderness grunt slots automatically.
// Explicit test spawns and scripted combat keep their requested species.
const generatedWildernessBase = wildernessSpawn;
wildernessSpawn = function (position, type = 'grunt', scale = 1) {
  const generated =
    type === 'grunt' ? bridge.creatures?.generatedCreatures?.() : null;
  if (!generated?.length) return generatedWildernessBase(position, type, scale);
  const species = (colony().species ??= {});
  const eligible = generated.filter(
    (creature) => species[creature.id] || Object.keys(species).length < 64,
  );
  if (!eligible.length) return generatedWildernessBase(position, type, scale);
  const creature = eligible[Math.floor(G.rng() * eligible.length)];
  if (!ENEMIES[creature.id])
    registerCreatureRecipe(creature.id, { forge: creature }, false);
  if (!forgeDefinitions.has(creature.id))
    return generatedWildernessBase(position, type, scale);
  const enemy = generatedWildernessBase(position, creature.id, scale);
  if (enemy)
    species[creature.id] = {
      base: 'grunt',
      name: creature.spec.name,
      forgeJson: JSON.stringify(creature),
    };
  return enemy;
};
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
  if (actor.dead) return;
  const previous = forgeLastPositions.get(actor);
  const moved = previous ? actor.pos.distanceTo(previous) : 0;
  const moving = moved > 0.003;
  if (previous) previous.copy(actor.pos);
  else forgeLastPositions.set(actor, actor.pos.clone());
  if (rig.state === 'generated' && !actor.forgeAnimationReady) {
    actor.forgeAnimationReady = true;
    forgeAction(actor, 'spawn');
  }
  if (actor.forgeAim && !forgeActions.has(actor)) {
    const direction = actor.forgeAim.clone().sub(actor.pos);
    direction.y = 0;
    direction.normalize();
    steerForgedEnemy(actor, direction, dt, 0);
  }
  const action = forgeActions.get(actor);
  if (action && rig.playback.finished) {
    forgeActions.delete(actor);
    actor.forgePivoting = false;
  }
  if (!forgeActions.has(actor) && !actor.forgePivoting) {
    const speed = moved / Math.max(dt, 0.001);
    rig.setAnimation(
      moving ? (speed > actor.d.spd * 0.65 ? 'run' : 'walk') : 'idle',
    );
  }
  rig.update(dt);
  actor.body = rig.mesh;
};
const forgeUpdateBase = updatePlayer;
updatePlayer = function (dt) {
  forgeUpdateBase(dt);
  for (const [enemy, attack] of forgeAttacks) {
    if (enemy.dead) {
      forgeAttacks.delete(enemy);
      continue;
    }
    if (G.time < attack.at) continue;
    forgeAttacks.delete(enemy);
    const target = attack.target,
      goal = target.corePos || target.pos;
    if (
      (target.hp > 0 || target.coreHp > 0) &&
      goal &&
      enemy.pos.distanceTo(goal) <
        (target.b ? CELL + 1 : enemy.d.size + (target.corePos ? 2.1 : 1.2)) &&
      Math.abs(enemy.pos.y - goal.y) < 5
    ) {
      hurtFriendly(target, enemy.d.dmg);
      if (target.b && target.hp <= 0) destroyStructure(target);
    }
  }
  for (const [model, corpse] of forgeCorpses) {
    corpse.rig.update(dt);
    corpse.left -= dt;
    if (corpse.left <= 0) {
      G.world.remove(model);
      forgeCorpses.delete(model);
    }
  }
  for (const [model, actor] of forgeModels) {
    if (model.parent !== G.world) {
      actor.dispose();
      forgeModels.delete(model);
    }
  }
};
const forgeDamageBase = damage;
damage = function (enemy, amount) {
  const wasDead = enemy.dead,
    hp = enemy.hp,
    rig = forgeModels.get(enemy.mesh);
  forgeDamageBase(enemy, amount);
  if (!rig || wasDead || enemy.hp >= hp) return;
  if (enemy.dead && rig.hasAnimation('death')) {
    forgeAttacks.delete(enemy);
    rig.setAnimation('death', true);
    enemy.hb.visible = false;
    enemy.mesh.traverse((o) => {
      if (o.isMesh) o.raycast = () => {};
    });
    G.world.add(enemy.mesh);
    forgeCorpses.set(enemy.mesh, {
      rig,
      left: rig.animationDuration('death') + 0.5,
    });
    while (forgeCorpses.size > 16) {
      const model = forgeCorpses.keys().next().value;
      G.world.remove(model);
      forgeCorpses.delete(model);
    }
  } else if (!forgeActions.has(enemy)) forgeAction(enemy, 'hit');
};
const forgePushBase = pushEnemy;
pushEnemy = function (enemy, from, power) {
  forgePushBase(enemy, from, power);
  if (!enemy.dead && power >= 10 && forgeAction(enemy, 'stagger'))
    forgeAttacks.delete(enemy);
};
const forgeDiscardBase = discardWorld;
discardWorld = function () {
  for (const actor of forgeModels.values()) actor.dispose();
  forgeModels.clear();
  forgeAttacks.clear();
  forgeCorpses.clear();
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
