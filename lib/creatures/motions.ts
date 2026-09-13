export const CREATURE_MOTIONS = {
  idle: { label: 'Idle', loop: true },
  walk: { label: 'Walk', loop: true },
  run: { label: 'Run / chase', loop: true },
  attack: { label: 'Basic attack', loop: false },
  hit: { label: 'Hit reaction', loop: false },
  death: { label: 'Death', loop: false },
  'turn-left': { label: 'Pivot left', loop: true },
  'turn-right': { label: 'Pivot right', loop: true },
  'turn-around': { label: 'Turn around', loop: false },
  charge: { label: 'Charge', loop: true },
  leap: { label: 'Leap', loop: false },
  cast: { label: 'Cast / roar', loop: false },
  stagger: { label: 'Stagger', loop: false },
  jump: { label: 'Jump', loop: false },
  land: { label: 'Landing', loop: false },
  spawn: { label: 'Spawn / rise', loop: false },
} as const;
export type CreatureMotion = keyof typeof CREATURE_MOTIONS;
