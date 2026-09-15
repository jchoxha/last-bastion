import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { makeCreature } from '../../lib/creatures/core.ts';
import { PipelineError } from './tripo.mjs';

const INPUT_ID = /^[a-z0-9_-]{1,60}$/;

function safeFile(value, field) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]*\.png$/i.test(value))
    throw new Error(`Packaged creature has an invalid ${field} filename.`);
  return value;
}

// Packaged inputs keep approved card art and a separately approved modeling
// specification together. They make no provider call until a generation job starts.
export async function loadPackagedInputs(root) {
  const directory = path.join(root, 'public/creatures/pipeline-inputs');
  let names = [];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const inputs = new Map();
  for (const name of names.filter((file) => file.endsWith('.json')).sort()) {
    const id = name.slice(0, -'.json'.length);
    if (!INPUT_ID.test(id))
      throw new Error(`Invalid packaged creature input ID: ${id}.`);
    const data = JSON.parse(await readFile(path.join(directory, name), 'utf8'));
    if (data?.version !== 1 || data.id !== id)
      throw new Error(`Invalid packaged creature input: ${name}.`);
    const creature = makeCreature(data.creature);
    const card = safeFile(data.card, 'card');
    const specification = safeFile(data.specification, 'specification');
    inputs.set(id, { id, creature, card, specification });
  }
  return {
    catalog: [...inputs.values()].map(({ id, creature }) => ({
      id,
      name: creature.spec.name,
      source: 'packaged',
    })),
    async resolve(request) {
      const input = inputs.get(request.rosterId);
      if (!input) return null;
      if (request.bodyPlan !== input.creature.spec.bodyPlan)
        throw new PipelineError(
          `${input.creature.spec.name} requires the ${input.creature.spec.bodyPlan} body plan.`,
        );
      if (request.form !== input.creature.spec.form)
        throw new PipelineError(
          `${input.creature.spec.name} is packaged only as a ${input.creature.spec.form} form.`,
        );
      return {
        creature: input.creature,
        definition: { name: input.creature.spec.name },
        art: await readFile(path.join(directory, input.specification)),
        cardArt: await readFile(path.join(directory, input.card)),
        directModelInput: true,
        provenance: {
          repository: 'jchoxha/last-bastion',
          inputId: input.id,
          kind: 'packaged-card-and-mesh-spec',
        },
      };
    },
  };
}
