export const CREATURE_ART_STYLE =
  'Flat 2D hand-drawn cartoon illustration in the original Chimera Cards style: simple bold shapes, ' +
  'thick confident black outlines, flat matte color fills and minimal shading, with a charming ' +
  'expressive face and the dramatic seriousness of fantasy trading-card monster art. Use an intense ' +
  'heroic pose, moody dramatic lighting and an epic elemental backdrop. Single creature, centered ' +
  'and filling a square full-bleed composition whose painted artwork reaches all four edges. No ' +
  'text, card frame, UI, border, margin, photorealism, glossy 3D rendering or humans unless the ' +
  'creature description requires them.';

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
  return `Convert this card illustration into one complete 3D-generation specification image. Preserve the creature's identity, colors, markings and expressive character, but redesign the rendering as a chunky retro low-poly third-person roguelike character: broad faceted planes, simplified game-ready volumes, exaggerated readable proportions, four to six matte colors, sparse painted accents and a crisp silhouette that fits earthy geometric terrain. ${pose} Show a level three-quarter view with every limb, joint and foot fully visible and separated; keep the body centered and entirely inside the frame. Use even broad daylight and a plain muted sky-to-ground studio backdrop. Integrate elemental energy into attached anatomy or surface markings. Remove the dramatic card pose, scenery, text, frame, particles, floating effects and cast-shadow clutter. No extra or fused limbs, crossed legs, foreshortened feet, photoreal fur, glossy materials, voxel cubes, multiple views or turntable sheet.`;
}
