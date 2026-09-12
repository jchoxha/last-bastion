// Portable content contract. No renderer, browser storage, or provider dependency.
export const BODY_TYPES = ['Humanoid', 'Beast', 'Aberration'] as const;
export const FAMILIES = [
  'Mammalian',
  'Reptilian',
  'Avian',
  'Piscine',
  'Insectoid',
  'Amphibian',
  'Draconic',
] as const;
export const MANIFESTATIONS = [
  'Eldritch',
  'Construct',
  'Ooze',
  'Flora',
  'Crystalline',
  'Formless',
  'Parasitic',
  'Abyssal',
  'Fungal',
] as const;
export const SUBTYPES = [
  'Mechanical',
  'Elemental',
  'Giant',
  'Demonic',
  'Undead',
  'Hallowed',
  'Feral',
  'Ancient',
  'Swarm',
  'Cursed',
  'Spectral',
] as const;
export const ATTUNEMENTS = [
  'Physical',
  'Fire',
  'Frost',
  'Nature',
  'Arcane',
  'Shadow',
  'Holy',
  'Void',
  'Water',
  'Air',
  'Stone',
  'Energy',
  'Mind',
] as const;
export const ARCHETYPES = [
  'Warrior',
  'Rogue',
  'Mage',
  'Warlock',
  'Priest',
  'Shaman',
  'Ranger',
  'Engineer',
] as const;
export const FORMS = ['baby', 'young', 'regular', 'elite', 'boss'] as const;
export const ROLES = ['balanced', 'skirmisher', 'bulwark'] as const;
export const BODY_PLANS = {
  'canine-v1': {
    label: 'Canine quadruped',
    ready: true,
    description:
      'Four legs, neck, jaw, and two tail joints; prototype rest / idle / walk poses.',
  },
  'humanoid-v1': {
    label: 'Humanoid biped',
    ready: true,
    description:
      'Two arms, two legs, neck and jaw; prototype rest / idle / walk poses.',
  },
  'avian-draft': {
    label: 'Avian (planned)',
    ready: false,
    description: 'Winged body plan awaiting a tested rig.',
  },
  'aquatic-draft': {
    label: 'Aquatic (planned)',
    ready: false,
    description: 'Swimming body plan awaiting a tested rig.',
  },
  'arthropod-draft': {
    label: 'Arthropod (planned)',
    ready: false,
    description: 'Multiple limb pairs; rig not implemented.',
  },
  'draconic-draft': {
    label: 'Draconic (planned)',
    ready: false,
    description: 'Wing and limb layout must be designed before rigging.',
  },
  'serpentine-draft': {
    label: 'Serpentine (planned)',
    ready: false,
    description: 'Long segmented spine; rig not implemented.',
  },
  'amorphous-draft': {
    label: 'Amorphous (planned)',
    ready: false,
    description:
      'Deformation or effects pipeline; conventional skeleton not assumed.',
  },
  'radial-draft': {
    label: 'Radial / tentacled (planned)',
    ready: false,
    description: 'Attachment and limb layout awaiting design.',
  },
} as const;
export type BodyPlan = keyof typeof BODY_PLANS;
export type CreatureInput = {
  seed: string;
  concept: string;
  bodies: string[];
  family: string;
  manifestation: string;
  archetype: string;
  subtypes: string[];
  attunements: string[];
  form: string;
  bodyPlan: BodyPlan;
  role: string;
};
export type CreatureSpec = CreatureInput & {
  name: string;
  description: string;
  color: string;
  accent: string;
};
export type Creature = {
  version: 1;
  id: string;
  spec: CreatureSpec;
  stats: { hp: number; speed: number; damage: number; radius: number };
  assets: { model: 'prototype' | 'awaiting-rig'; rig: BodyPlan; rigVersion: 1 };
};
export const DEFAULT_INPUT: CreatureInput = {
  seed: 'voltfang-1',
  concept: 'A slate-blue wolf with a swept mane and cyan fur markings.',
  bodies: ['Beast'],
  family: 'Mammalian',
  manifestation: '',
  archetype: '',
  subtypes: [],
  attunements: ['Physical', 'Energy'],
  form: 'regular',
  bodyPlan: 'canine-v1',
  role: 'skirmisher',
};
export const COLLECTION_KEY = 'last-bastion-creatures-v1';
export const MAX_CREATURES = 48;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Expected a creature object.');
  return value as Record<string, unknown>;
}
function string(
  value: unknown,
  field: string,
  max: number,
  empty = false,
): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (!empty && !value.trim())
  )
    throw Error(`Invalid ${field}.`);
  return value.trim();
}
function choice(
  value: unknown,
  choices: readonly string[],
  field: string,
): string {
  if (typeof value !== 'string' || !choices.includes(value))
    throw Error(`Invalid ${field}.`);
  return value;
}
function choices(
  value: unknown,
  allowed: readonly string[],
  field: string,
  min: number,
  max: number,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length < min ||
    value.length > max ||
    new Set(value).size !== value.length
  )
    throw Error(`Invalid ${field}.`);
  return value.map((v) => choice(v, allowed, field)).sort();
}
export function compatiblePlans(bodies: string[], family: string): BodyPlan[] {
  // Taxonomic family is not a skeleton. Require an explicit physical plan within it.
  if (bodies.includes('Aberration')) return ['amorphous-draft', 'radial-draft'];
  if (bodies.includes('Humanoid')) return ['humanoid-v1'];
  switch (family) {
    case 'Mammalian':
      return ['canine-v1', 'humanoid-v1'];
    case 'Avian':
      return ['avian-draft'];
    case 'Piscine':
      return ['aquatic-draft'];
    case 'Insectoid':
      return ['arthropod-draft'];
    case 'Draconic':
      return ['draconic-draft', 'serpentine-draft'];
    case 'Reptilian':
      return ['serpentine-draft', 'draconic-draft'];
    default:
      return ['aquatic-draft'];
  }
}
export function validateInput(value: unknown): CreatureInput {
  const v = object(value);
  const bodies = choices(v.bodies, BODY_TYPES, 'body types', 1, 2);
  const family = bodies.includes('Beast')
    ? choice(v.family, FAMILIES, 'family')
    : '';
  const manifestation = bodies.includes('Aberration')
    ? choice(v.manifestation, MANIFESTATIONS, 'manifestation')
    : '';
  const archetype = bodies.includes('Humanoid')
    ? choice(v.archetype, ARCHETYPES, 'archetype')
    : '';
  const bodyPlan = choice(
    v.bodyPlan,
    compatiblePlans(bodies, family),
    'body plan for this creature',
  ) as BodyPlan;
  return {
    seed: string(v.seed, 'seed', 80),
    concept: string(v.concept, 'concept', 500, true),
    bodies,
    family,
    manifestation,
    archetype,
    subtypes: choices(v.subtypes, SUBTYPES, 'subtypes', 0, SUBTYPES.length),
    attunements: choices(v.attunements, ATTUNEMENTS, 'attunements', 1, 2),
    form: choice(v.form, FORMS, 'form'),
    role: choice(v.role, ROLES, 'combat role'),
    bodyPlan,
  };
}
function hash(text: string, start = 2166136261): number {
  let h = start;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function makeCreature(value: unknown): Creature {
  const raw = object(value),
    input = validateInput(raw);
  const color = (key: string) => {
    if (
      typeof raw[key] !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(raw[key] as string)
    )
      throw Error(`Invalid ${key} color.`);
    return (raw[key] as string).toLowerCase();
  };
  const spec: CreatureSpec = {
    ...input,
    name: string(raw.name, 'name', 60),
    description: string(raw.description, 'description', 600),
    color: color('color'),
    accent: color('accent'),
  };
  const canonical = JSON.stringify(spec);
  const scale = (
    { baby: 0.65, young: 0.85, regular: 1, elite: 1.2, boss: 1.4 } as Record<
      string,
      number
    >
  )[spec.form];
  const profile =
    spec.role === 'bulwark'
      ? [130, 1.3, 12]
      : spec.role === 'skirmisher'
        ? [55, 3.4, 8]
        : [85, 2.2, 10];
  return {
    version: 1,
    id: `cf_${hash(canonical).toString(16).padStart(8, '0')}${hash(canonical, 5381).toString(16).padStart(8, '0')}`,
    spec,
    stats: {
      hp: Math.round(profile[0] * scale),
      speed: profile[1],
      damage: Math.round(profile[2] * scale),
      radius: 0.55 * scale,
    },
    assets: {
      model: BODY_PLANS[spec.bodyPlan].ready ? 'prototype' : 'awaiting-rig',
      rig: spec.bodyPlan,
      rigVersion: 1,
    },
  };
}
export function generateLocal(value: unknown): Creature {
  const input = validateInput(value),
    n = hash(JSON.stringify(input));
  const prefixes = ['Storm', 'Ash', 'Thorn', 'Frost', 'Dusk', 'Iron'];
  const endings =
    input.bodyPlan === 'canine-v1'
      ? ['fang', 'pelt', 'howl']
      : ['warden', 'walker', 'heart'];
  const palette = [
    '#596c89',
    '#8b5646',
    '#52745d',
    '#708fa1',
    '#675579',
    '#777d82',
  ];
  return makeCreature({
    ...input,
    name: prefixes[n % prefixes.length] + endings[(n >>> 8) % endings.length],
    description:
      input.concept ||
      `A ${input.attunements.join('/')} ${input.family || input.manifestation || input.archetype} creature.`,
    color: palette[n % palette.length],
    accent: '#79d6e8',
  });
}
export function parseCreature(raw: string): Creature {
  if (raw.length > 16000) throw Error('Creature file exceeds 16 KB.');
  const v = object(JSON.parse(raw));
  if (v.version !== 1) throw Error('Unsupported creature version.');
  // Never trust imported IDs, stats, asset status or arbitrary executable effects.
  return makeCreature(v.spec);
}
export function parseCollection(raw: string): Creature[] {
  if (raw.length > 800000) throw Error('Creature collection is too large.');
  const list: unknown = JSON.parse(raw);
  if (!Array.isArray(list) || list.length > MAX_CREATURES)
    throw Error('Invalid creature collection.');
  return [
    ...new Map(
      list.map((v) => {
        const c = parseCreature(JSON.stringify(v));
        return [c.id, c] as const;
      }),
    ).values(),
  ];
}
export function referencePrompt(creature: Creature): string {
  const s = creature.spec;
  return `${s.name}: ${s.description}\nIdentity: ${s.bodies.join(' + ')}; ${s.family || s.manifestation || s.archetype}; ${s.subtypes.join(', ') || 'no subtypes'}; ${s.attunements.join('/')}; ${s.form} form.\nPhysical plan: ${BODY_PLANS[s.bodyPlan].label}, revision 1. ${BODY_PLANS[s.bodyPlan].description}\nPreserve the approved base rig's proportions and joint positions. ${s.bodyPlan === 'canine-v1' ? 'Four paws on level ground, naturally bent rear hocks, separated legs, tail clear of the body.' : s.bodyPlan === 'humanoid-v1' ? 'Neutral A-pose, separated arms and legs, feet on level ground.' : 'Body plan is not implemented: establish and approve its anatomy before generating a mesh.'}\nBody color ${s.color}; accent ${s.accent}. Single full-body three-quarter view, plain white background, even light, clear silhouette. No text, lightning, particles, scenery, or floating accessories. A reference image does not guarantee correct rigging or skin weights.`;
}
export function authoringPrompt(input: CreatureInput): string {
  return `Author one creature as JSON. Preserve every input field exactly. Add ONLY name (1–60 characters), description (1–600 characters), color and accent (#RRGGBB). Do not add stats, effects, URLs, code, or assets. Anatomy must match the selected bodyPlan; body plans with draft in their ID are concepts only. Input: ${JSON.stringify(validateInput(input))}`;
}
export async function generateWithService(
  input: CreatureInput,
  endpoint: string,
  signal?: AbortSignal,
): Promise<Creature> {
  const url = new URL(endpoint);
  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
  )
    throw Error('Use HTTPS or a local provider service.');
  const expected = validateInput(input);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 1, input: expected }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
      : AbortSignal.timeout(45000),
    credentials: 'omit',
  });
  if (!response.ok)
    throw Error(`Creature service failed (${response.status}).`);
  if (!response.body) throw Error('Empty service response.');
  const reader = response.body.getReader();
  let length = 0,
    text = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > 16000)
        throw Error('Creature service response exceeds 16 KB.');
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
  }
  const result = object(JSON.parse(text));
  const creature = makeCreature(result.spec);
  if (JSON.stringify(validateInput(creature.spec)) !== JSON.stringify(expected))
    throw Error('Provider changed the requested taxonomy or body plan.');
  return creature;
}
