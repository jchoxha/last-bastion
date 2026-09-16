import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { validateRiggedGlb } from './validate.mjs';
import { validateDeformationGates } from './deformation-gate.mjs';
import { HUMANOID_ACTION_DONOR, RigCompatibilityError } from './rig-profiles.mjs';

const execFileAsync = promisify(execFile);

export function findBlenderPath() {
  if (process.env.BLENDER_PATH && existsSync(process.env.BLENDER_PATH)) {
    return process.env.BLENDER_PATH;
  }
  const candidates = [
    'blender',
    'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe',
    'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
    '/usr/bin/blender',
    '/usr/local/bin/blender',
    '/snap/bin/blender',
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return 'blender';
}

export async function runBlenderRebind({
  meshPath,
  donorPath,
  outputPath,
  reportPath,
  blenderPath,
}) {
  const blender = blenderPath || findBlenderPath();
  const scriptPath = new URL('./blender-rebind.py', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const args = [
    '--background',
    '--python',
    scriptPath,
    '--',
    '--mesh',
    meshPath,
    '--donor',
    donorPath,
    '--out',
    outputPath,
  ];
  if (reportPath) {
    args.push('--report', reportPath);
  }

  try {
    const { stdout, stderr } = await execFileAsync(blender, args, {
      timeout: 120000,
    });
    let report = null;
    if (reportPath && existsSync(reportPath)) {
      report = JSON.parse(await readFile(reportPath, 'utf8'));
    }
    return { stdout, stderr, report };
  } catch (err) {
    throw new RigCompatibilityError(`Headless Blender rebind failed: ${err.message}`);
  }
}

export async function rebindHumanoidMesh(
  meshBytes,
  {
    donorPath = new URL('./animations/humanoid-action-donor.glb', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    blenderPath,
  } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), 'rebind-humanoid-'));
  const meshPath = join(dir, 'mesh.glb');
  const outputPath = join(dir, 'rebound.glb');
  const reportPath = join(dir, 'report.json');

  try {
    await writeFile(meshPath, meshBytes);
    const { report } = await runBlenderRebind({
      meshPath,
      donorPath,
      outputPath,
      reportPath,
      blenderPath,
    });
    const reboundBytes = await readFile(outputPath);
    await validateRiggedGlb(reboundBytes, 'humanoid-v1');
    const deformationReport = validateDeformationGates(reboundBytes);
    return {
      bytes: reboundBytes,
      report: {
        status: 'rebound',
        bodyPlan: 'humanoid-v1',
        donorSha256: HUMANOID_ACTION_DONOR.sha256,
        blenderReport: report,
        deformationReport,
      },
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
