export function modelPrompt(creature, detail = '') {
  const spec = creature.spec;
  const anatomy =
    spec.bodyPlan === 'canine-v1'
      ? 'Canine quadruped, exactly four distinct legs and four paws planted on level ground, neutral symmetrical standing pose, relaxed spine, closed jaw, one tail separated from hind legs.'
      : 'Humanoid biped, exactly two legs and two arms, symmetrical neutral A-pose, arms angled away from torso, feet planted, relaxed separated hands.';
  const fixed = `Stylized fantasy game creature. ${anatomy} Full body, clear gaps between limbs, coherent anatomy, compact sculpted surface detail, painted PBR materials. Form: ${spec.form}. Name: ${spec.name}. `;
  return {
    prompt: (fixed + (detail || spec.description || spec.concept)).slice(
      0,
      1024,
    ),
    negative_prompt:
      'extra limbs, fused limbs, disconnected body parts, action pose, floating effects, lightning geometry, smoke, scenery, pedestal, text, cards, multiple creatures, weapons',
  };
}
