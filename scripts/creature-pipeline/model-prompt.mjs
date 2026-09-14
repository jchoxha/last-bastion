export function modelPrompt(creature, detail = '') {
  const spec = creature.spec;
  const anatomy =
    spec.bodyPlan === 'canine-v1'
      ? 'Canine quadruped, exactly four distinct legs and four paws planted on level ground, neutral symmetrical standing pose, relaxed spine, closed jaw, one tail separated from hind legs.'
      : 'Humanoid biped, exactly two legs and two arms, symmetrical neutral A-pose, arms angled away from torso, feet planted, relaxed separated hands.';
  const fixed = `Stylized low-poly 3D creature for a colorful third-person roguelike. Chunky faceted geometry, simplified game-ready volumes, crisp silhouette, exaggerated but coherent proportions, four to six matte colors, subtle cel shading, sparse hand-painted accents, intentionally rough retro-3D character, readable at gameplay distance and suited to earthy low-poly terrain. Preserve a bold expressive cartoon identity with serious monster presence. ${anatomy} Full body, clear gaps between limbs, compact sculpted detail. Integrate elemental energy into markings, materials or attached anatomy. Form: ${spec.form}. Name: ${spec.name}. `;
  return {
    prompt: (fixed + (detail || spec.description || spec.concept)).slice(
      0,
      1024,
    ),
    negative_prompt:
      'extra limbs, fused limbs, disconnected parts, action pose, floating effects, lightning geometry, smoke, scenery, pedestal, text, cards, multiple creatures, photorealism, glossy materials, detailed fur, smooth toy rendering, voxel cubes',
  };
}
