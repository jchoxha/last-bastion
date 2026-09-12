import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { buildWiki, parseWiki } from '../scripts/build-wiki.mjs';

const chapters = await buildWiki(true);
assert.equal(chapters.length, 15);
assert(chapters.every((c) => c.intro && c.sections.length >= 2));
assert.throws(
  () => parseWiki('## Test\n### Table\n| A | B |\n| --- | --- |\n| one |'),
  /Invalid wiki table/,
);
const markdown = await fs.readFile(
  new URL('../docs/GAME-WIKI.md', import.meta.url),
  'utf8',
);
for (const match of markdown.matchAll(
  /https:\/\/github.com\/jchoxha\/last-bastion\/blob\/main\/([^\s)]+)/g,
)) {
  await fs.access(new URL('../' + match[1], import.meta.url));
}
const tables = chapters.flatMap((c) =>
  c.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'table')),
);
const require = createRequire(import.meta.url);
const { api } = require('./combat-harness.cjs');
for (const abilities of Object.values(api.ABILITIES))
  for (const ability of abilities) {
    const row = tables
      .filter((t) => t.headers.includes('Cooldown'))
      .flatMap((t) => t.rows)
      .find((r) => r[1] === ability[0]);
    assert(row, 'Missing current ability: ' + ability[0]);
    assert.equal(
      Number(row[2]),
      ability[3],
      'Outdated cooldown: ' + ability[0],
    );
  }
for (const building of api.builds.filter((b) => !b.retired && !b.core)) {
  const row = tables
    .filter((t) => t.headers.includes('Base gold'))
    .flatMap((t) => t.rows)
    .find((r) => r[0] === building.name);
  assert(row, 'Missing current building: ' + building.name);
  assert.equal(
    Number(row[1]),
    building.cost,
    'Outdated base price: ' + building.name,
  );
  if (building.materials)
    for (const [key, index] of [
      ['logs', 2],
      ['stone', 3],
      ['ore', 4],
    ])
      assert.equal(
        Number(row[index]),
        building.materials[key] || 0,
        'Outdated recipe: ' + building.name,
      );
  if (building.work)
    assert.equal(
      Number(row[5]),
      building.work,
      'Outdated work requirement: ' + building.name,
    );
}
console.log(
  'PASS wiki compilation, source paths, and current ability/building catalog values',
);
