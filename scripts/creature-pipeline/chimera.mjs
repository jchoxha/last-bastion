// Bundle the actual upstream forge/validators; only replace its inference transport.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import { makeCreature, DEFAULT_INPUT } from '../../lib/creatures/core.ts';
import { PipelineError } from './tripo.mjs';

export const CHIMERA_REVISION = 'fb431b8ac6c4246e9f736d3c60cc120dde701f57';
export const CHIMERA_REPO = 'https://github.com/jchoxha/chimera_cards.git';
export async function loadChimera(
  root,
  source = path.join(root, 'work/chimera-cards'),
) {
  const cache = path.join(root, 'work/creature-pipeline');
  await mkdir(cache, { recursive: true });
  try {
    await access(path.join(source, '.git'));
  } catch {
    execFileSync(
      'git',
      ['clone', '--depth', '1', '--no-checkout', CHIMERA_REPO, source],
      {
        stdio: 'pipe',
      },
    );
    execFileSync('git', ['fetch', '--depth', '1', 'origin', CHIMERA_REVISION], {
      cwd: source,
      stdio: 'pipe',
    });
    execFileSync('git', ['checkout', CHIMERA_REVISION], {
      cwd: source,
      stdio: 'pipe',
    });
  }
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: source,
    encoding: 'utf8',
  }).trim();
  if (revision !== CHIMERA_REVISION)
    throw Error(
      'Chimera revision differs from the pinned integration. Update and test the adapter before changing the pin.',
    );
  if (
    execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      cwd: source,
      encoding: 'utf8',
    }).trim()
  )
    throw Error(
      'Chimera source has local edits. Use a clean pinned checkout for reproducible generation.',
    );
  const file = (p) =>
    JSON.stringify(path.join(source, 'src', p).replaceAll('\\', '/'));
  const entry = path.join(cache, 'chimera-entry.mjs');
  await writeFile(
    entry,
    `export {forgeCreature} from ${file('data/forgeCreature.js')};\nexport {creatureArtPrompt} from ${file('data/artStyle.js')};\nexport {ROSTER} from ${file('data/roster.js')};\nexport {BESTIARY} from ${file('data/bestiary.js')};\nexport {configureText} from ${file('ai/provider.js')};\n`,
  );
  const bundle = await rolldown({
    input: entry,
    platform: 'node',
    plugins: [
      {
        name: 'chimera-server-transport',
        load(id) {
          if (id.replaceAll('\\', '/').endsWith('/src/ai/provider.js'))
            return `
        let generate;
        export function configureText(fn) { generate = fn; }
        export async function generateText(prompt, options) {
          if (!generate) throw Error('Chimera text backend is not configured.');
          return generate(prompt, options);
        }`;
        },
      },
    ],
  });
  const output = path.join(cache, 'chimera.mjs');
  await bundle.write({ file: output, format: 'es' });
  await bundle.close();
  const api = await import(pathToFileURL(output).href);
  api.configureText(async (prompt, { maxTokens }) => {
    const endpoint =
      process.env.CREATURE_AI_URL ||
      'http://127.0.0.1:11434/v1/chat/completions';
    if (!process.env.CREATURE_AI_MODEL)
      throw Error('Configure CREATURE_AI_MODEL for new concepts.');
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(180000),
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.CREATURE_AI_KEY
          ? { Authorization: `Bearer ${process.env.CREATURE_AI_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        model: process.env.CREATURE_AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) throw Error('Chimera text backend failed.');
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  });
  return {
    revision,
    catalog: api.ROSTER.map(({ id, name, biology, family }) => ({
      id,
      name,
      biology,
      family,
    })),
    async resolve(request) {
      let definition, art;
      if (request.rosterId) {
        const found = api.ROSTER.find((c) => c.id === request.rosterId);
        if (!found) throw new PipelineError('Unknown Chimera roster creature.');
        definition = {
          ...found,
          lore: api.BESTIARY[found.id]?.lore?.join('\n\n') || '',
        };
        const suffix = request.form === 'regular' ? '' : `-${request.form}`;
        try {
          art = await readFile(
            path.join(source, 'public/art/gen', `${found.id}${suffix}.png`),
          );
        } catch {
          if (request.mode !== 'text')
            throw new PipelineError(
              'Chimera has no readable baked portrait for this creature/form. Select a form with existing art or forge a new concept.',
            );
        }
      } else {
        definition = await api.forgeCreature(
          `${request.concept}\nPhysical body constraint: ${request.bodyPlan === 'canine-v1' ? 'a mammalian canine quadruped with exactly four legs' : 'a humanoid biped with two arms and two legs'}.`,
          { withPortrait: false },
        );
        // Upstream deliberately falls back to heuristics. A production job must expose failure.
        if (definition.forged !== 'ai')
          throw new PipelineError(
            'Chimera AI forge fell back to heuristics. Configure/check CREATURE_AI_MODEL and CREATURE_AI_URL.',
          );
      }
      const bodies = definition.biology;
      if (
        request.bodyPlan === 'canine-v1' &&
        (!bodies.includes('Beast') ||
          bodies.includes('Humanoid') ||
          definition.family !== 'Mammalian')
      )
        throw new PipelineError(
          'This Chimera creature does not fit the canine body plan.',
        );
      if (request.bodyPlan === 'humanoid-v1' && !bodies.includes('Humanoid'))
        throw new PipelineError(
          'This Chimera creature does not fit the humanoid body plan.',
        );
      const creature = makeCreature({
        ...DEFAULT_INPUT,
        seed: request.seed,
        concept: (request.concept || definition.blurb || definition.name).slice(
          0,
          500,
        ),
        name: definition.name,
        description: (
          definition.description ||
          definition.lore ||
          definition.blurb ||
          definition.name
        ).slice(0, 600),
        bodies,
        family: definition.family || '',
        manifestation: '',
        archetype: Array.isArray(definition.class)
          ? definition.class[0]
          : definition.class || '',
        subtypes: definition.subtypes || [],
        attunements: definition.attunement,
        form: request.form,
        bodyPlan: request.bodyPlan,
        color: '#506c8e',
        accent: '#73dded',
      });
      return {
        definition,
        creature,
        art,
        artPrompt: api.creatureArtPrompt(
          { ...definition, size: request.form },
          { form: request.form },
        ),
      };
    },
  };
}
