export const CREATURE_ART_STYLE =
  'Stylized low-poly 3D creature concept for a colorful third-person roguelike: chunky faceted ' +
  'geometry, simplified game-ready volumes, a crisp readable silhouette, exaggerated proportions, ' +
  'a restrained palette of four to six matte colors, subtle cel-shaded lighting and sparse ' +
  'hand-painted accents. Preserve the charm, bold shape language and expressive face of a ' +
  'hand-drawn cartoon monster, with serious trading-card creature presence. Intentionally rough ' +
  'retro-3D character, readable at gameplay distance and visually at home among earthy low-poly ' +
  'terrain, angular rocks and simple geometric foliage. One complete creature in an alert neutral ' +
  'pose, centered in a square composition; head aligned with the body, every limb and foot clearly ' +
  'visible and separated, and the entire silhouette inside the frame. Integrate elemental energy ' +
  'into body markings, materials or attached anatomy. Simple muted sky-to-ground backdrop and broad ' +
  'daylight. No text, card frame, UI, scenery clutter, particles, detached effects, crossed limbs, ' +
  'photorealism, detailed fur strands, glossy materials, smooth toy rendering or voxel cubes.';

const FORM = {
  baby: 'Juvenile form with rounded chunky proportions, an oversized head, expressive eyes and short stubby limbs.',
  young:
    'Half-grown adolescent form, leaner, more compact and slightly less developed than an adult.',
  regular: 'Typical adult form with balanced, characteristic proportions.',
  elite:
    'Larger veteran form with a stronger build and only minor scars or heavier armor; keep the core design plainer than a boss.',
  boss: 'Apex boss form with a larger build and grander attached anatomy, armor, horns, crest or integrated elemental markings while preserving clear riggable anatomy.',
};

export function creatureArtPrompt(definition, form = 'regular') {
  const subject =
    definition.description ||
    definition.blurb ||
    definition.lore ||
    definition.name ||
    'a fantasy creature';
  return `Subject: ${definition.name || 'Creature'} — ${subject}.\n\n${FORM[form] || FORM.regular}\n\nStyle: ${CREATURE_ART_STYLE}`;
}

export function modelingReferencePrompt(bodyPlan) {
  const pose =
    bodyPlan === 'canine-v1'
      ? 'Neutral standing canine quadruped with exactly four separated legs, four paws planted on one level, a straight relaxed spine, head facing in the same direction as the body, closed jaw and one tail separated from the hind legs.'
      : 'Neutral humanoid A-pose with exactly two separated legs and two arms angled away from the torso, both feet planted, head facing forward and relaxed separated hands.';
  return `Create one complete low-poly 3D modeling reference from this creature artwork. Preserve its identity, proportions, silhouette, faceted geometry, matte palette, markings and expressive character. ${pose} Three-quarter view with every limb and foot visible. Use broad daylight and a simple muted sky-to-ground backdrop. Keep elemental energy integrated into markings or attached anatomy. Remove scenery, text, cards, particles, floating effects and cast-shadow clutter. No extra limbs, crossed limbs, photoreal fur, glossy materials, voxel cubes or multiple views.`;
}
