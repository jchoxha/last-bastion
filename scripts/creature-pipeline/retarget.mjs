import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildAnimationSet } from './animation-set.mjs';
import { validateRiggedGlb } from './validate.mjs';

const [input, output, calibrationFile] = process.argv.slice(2);
if (!input || !output)
  throw Error(
    'Usage: node scripts/creature-pipeline/retarget.mjs INPUT.glb OUTPUT.glb [CALIBRATION.json]',
  );
if (
  [output, `${output}.report.json`].some((file) =>
    [input, calibrationFile]
      .filter(Boolean)
      .some((source) => path.resolve(source) === path.resolve(file)),
  )
)
  throw Error('Output must not overwrite input.');
const calibration = calibrationFile
  ? JSON.parse(await readFile(calibrationFile, 'utf8'))
  : {};
const bytes = await readFile(input);
await validateRiggedGlb(bytes, 'canine-v1');
const trial = await buildAnimationSet(bytes, 'canine-v1', calibration);
if (trial.report.status === 'skipped') throw Error(trial.report.reason);
await writeFile(output, trial.bytes, { flag: 'wx' });
await writeFile(
  `${output}.report.json`,
  JSON.stringify(trial.report, null, 2) + '\n',
  { flag: 'wx' },
);
console.log(JSON.stringify(trial.report, null, 2));
