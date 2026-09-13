/* eslint-disable typescript/no-require-imports -- Local Chrome harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {
  chromium,
} = require('C:/Users/jchox/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  // npm run test:creature-pipeline writes this explicitly synthetic test asset.
  const roots = fs
    .readdirSync('work/pipeline-tests')
    .map((dir) => path.join('work/pipeline-tests', dir, 'public/creatures'))
    .filter((dir) => fs.existsSync(path.join(dir, 'index.json')));
  assert(roots.length, 'Run npm run test:creature-pipeline first.');
  const fixture =
    process.env.CREATURE_BROWSER_ASSETS || roots[roots.length - 1];
  const manifest = JSON.parse(
      fs.readFileSync(path.join(fixture, 'index.json')),
    ),
    asset = manifest.assets[0];
  const { build } = await import('rolldown');
  fs.writeFileSync(
    'work/pipeline-browser-entry.mjs',
    "import * as runtime from '../lib/creatures/generated.ts'; window.pipelineTest=runtime;",
  );
  await build({
    input: 'work/pipeline-browser-entry.mjs',
    platform: 'browser',
    output: { file: 'work/pipeline-browser.js', format: 'iife' },
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/runtime.js') {
      res.setHeader('Content-Type', 'application/javascript');
      res.end(fs.readFileSync('work/pipeline-browser.js'));
      return;
    }
    if (url.pathname === '/harness') {
      res.end('<script src="/runtime.js"></script>');
      return;
    }
    const match = url.pathname.match(
      /^\/(bad\/)?creatures\/(index\.json|asset_[a-f0-9]{24}\.(glb|png))$/,
    );
    if (match) {
      let bytes = fs.readFileSync(path.join(fixture, match[2]));
      if (match[1] && match[3] === 'glb') {
        bytes = Buffer.from(bytes);
        bytes[bytes.length - 1] ^= 1;
      }
      res.setHeader(
        'Content-Type',
        match[3] === 'glb'
          ? 'model/gltf-binary'
          : match[3] === 'png'
            ? 'image/png'
            : 'application/json',
      );
      res.end(bytes);
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(fs.readFileSync('playable/last-bastion-world-lab.html'));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      args: [
        '--enable-webgl',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/harness`);
    const evidence = await page.evaluate(
      async ({ creature, base }) => {
        const api = window.pipelineTest;
        await api.refreshGeneratedAssets(`${base}/creatures/`);
        const a = api.createRuntimeCreatureActor(creature),
          b = api.createRuntimeCreatureActor(creature);
        for (
          let i = 0;
          i < 200 && (a.state !== 'generated' || b.state !== 'generated');
          i++
        )
          await new Promise((resolve) => setTimeout(resolve, 25));
        if (a.state !== 'generated' || b.state !== 'generated')
          throw Error('Generated mesh did not load.');
        const otherClip = b.previewClipIndex;
        const qa = a.mesh.skeleton.bones.map((bone) =>
          bone.quaternion.toArray().join(','),
        );
        const qb = b.mesh.skeleton.bones.map((bone) =>
          bone.quaternion.toArray().join(','),
        );
        a.setAnimation('walk');
        for (let i = 0; i < 3; i++) a.update(0.08);
        a.group.updateMatrixWorld(true);
        b.group.updateMatrixWorld(true);
        const result = {
          animated: a.mesh.skeleton.bones.some(
            (bone, i) => qa[i] !== bone.quaternion.toArray().join(','),
          ),
          independent: b.mesh.skeleton.bones.every(
            (bone, i) => qb[i] === bone.quaternion.toArray().join(','),
          ),
          sharedGeometry: a.mesh.geometry === b.mesh.geometry,
          privateMaterials: a.mesh.material !== b.mesh.material,
          privateSkeleton: a.mesh.skeleton !== b.mesh.skeleton,
        };
        a.seekAnimation(0);
        const startPose = a.mesh.skeleton.bones.map((bone) =>
          bone.quaternion.toArray().join(','),
        );
        a.seekAnimation(1 / 30);
        if (Math.abs(a.playback.time - 1 / 30) > 1e-6)
          throw Error('Frame stepping did not advance exactly 1/30 second.');
        // Some provider clips hold their first pose until the first key at 1/30 s.
        a.seekAnimation(0.25);
        const steppedPose = a.mesh.skeleton.bones.map((bone) =>
          bone.quaternion.toArray().join(','),
        );
        if (
          Math.abs(a.playback.time - 0.25) > 1e-6 ||
          !steppedPose.some((pose, i) => pose !== startPose[i])
        )
          throw Error('Frame stepping did not sample the actual bones.');
        a.update(0);
        if (
          !a.mesh.skeleton.bones.every(
            (bone, i) => bone.quaternion.toArray().join(',') === steppedPose[i],
          )
        )
          throw Error('Paused update changed the pose.');
        a.seekAnimation(-1 / 30);
        if (Math.abs(a.playback.time - (a.playback.duration - 1 / 30)) > 1e-6)
          throw Error('Backward step did not wrap to clip end.');
        a.setAnimation('rest');
        if (a.playback.duration !== 0)
          throw Error('Static pose was exposed as a playable clip.');
        if (a.previewClips.length > 1) {
          a.setAnimation('walk');
          a.selectPreviewClip(a.previewClips.length - 1);
          a.seekAnimation(0.25);
          if (
            !a.mesh.skeleton.bones.some(
              (bone, i) =>
                bone.quaternion.toArray().join(',') !== steppedPose[i],
            )
          )
            throw Error('Alternative clip did not change the sampled pose.');
          if (b.previewClipIndex !== otherClip)
            throw Error('Preview choice affected another actor.');
          a.setAnimation('walk');
          a.seekAnimation(0.25);
          if (
            !a.mesh.skeleton.bones.every(
              (bone, i) =>
                bone.quaternion.toArray().join(',') === steppedPose[i],
            )
          )
            throw Error(
              'Switching back did not restore the original clip pose.',
            );
        }
        a.dispose();
        b.dispose();
        await api.refreshGeneratedAssets(`${base}/bad/creatures/`);
        try {
          await api.preloadGeneratedAsset(creature);
          throw Error('Tampered GLB was accepted.');
        } catch (e) {
          if (!e.message.includes('checksum')) throw e;
        }
        return result;
      },
      { creature: asset.creature, base },
    );
    assert(Object.values(evidence).every(Boolean), JSON.stringify(evidence));
    await page.goto(`${base}/#forge`);
    await page.getByRole('button', { name: /inspect mesh/ }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('.forge-preview')?.dataset.assetState ===
        'generated',
    );
    await page.getByLabel('Show skeleton').check();
    await page.getByLabel('Preview motion').selectOption('walk');
    await page
      .getByRole('button', { name: 'Restart clip', exact: true })
      .click();
    const animationTime = () =>
      page
        .locator('.forge-preview')
        .getAttribute('data-animation-time')
        .then(Number);
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector('.forge-preview').dataset.animationTime,
        ) === 0,
    );
    await page.getByRole('button', { name: 'Next frame', exact: true }).click();
    await page.waitForFunction(
      () =>
        Number(document.querySelector('.forge-preview').dataset.animationTime) >
        0,
    );
    assert(Math.abs((await animationTime()) - 1 / 30) < 1e-6);
    await page.waitForTimeout(150);
    assert(
      Math.abs((await animationTime()) - 1 / 30) < 1e-6,
      'Paused pose must remain fixed.',
    );
    await page
      .getByRole('button', { name: 'Previous frame', exact: true })
      .click();
    await page.waitForFunction(
      () =>
        Number(document.querySelector('.forge-preview').dataset.animationTime) <
        1e-6,
    );
    await page.getByLabel('Playback speed').selectOption('0.25');
    await page
      .getByRole('button', { name: 'Play animation', exact: true })
      .click();
    const rate = await page.evaluate(async () => {
      const el = document.querySelector('.forge-preview');
      const start = Number(el.dataset.animationTime),
        wall = performance.now();
      for (let i = 0; i < 20; i++) await new Promise(requestAnimationFrame);
      return (
        (Number(el.dataset.animationTime) - start) /
        ((performance.now() - wall) / 1000)
      );
    });
    assert(
      rate > 0.15 && rate < 0.35,
      `Expected quarter-speed playback, got ${rate}`,
    );
    await page
      .getByRole('button', { name: 'Pause animation', exact: true })
      .click();
    if (asset.report.clips.includes('attack')) {
      assert.equal(await page.getByLabel('Walk clip (preview)').count(), 0);
      const select = page.getByLabel('Preview motion');
      for (const name of asset.report.clips) {
        await select.selectOption(name);
        await page.waitForFunction(
          () =>
            Number(
              document.querySelector('.forge-preview').dataset
                .animationDuration,
            ) > 0,
        );
        await page
          .getByRole('button', { name: 'Restart clip', exact: true })
          .click();
        await page
          .getByRole('button', { name: 'Next frame', exact: true })
          .click();
        await page.waitForFunction(
          () =>
            Number(
              document.querySelector('.forge-preview').dataset.animationTime,
            ) > 0,
        );
      }
      await select.selectOption('death');
      await page
        .getByRole('button', { name: 'Restart clip', exact: true })
        .click();
      for (let i = 0; i < 45; i++)
        await page
          .getByRole('button', { name: 'Next frame', exact: true })
          .click();
      const end = await animationTime();
      const duration = Number(
        await page
          .locator('.forge-preview')
          .getAttribute('data-animation-duration'),
      );
      assert.ok(
        Math.abs(end - duration) < 1e-6,
        'one-shot clamps to final pose',
      );
      await page
        .getByRole('button', { name: 'Previous frame', exact: true })
        .click();
      await page.waitForFunction(() => {
        const e = document.querySelector('.forge-preview');
        return (
          Number(e.dataset.animationTime) < Number(e.dataset.animationDuration)
        );
      });
    }
    await page.screenshot({
      path: 'work/pipeline-generated-fixture.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.getByRole('button', { name: 'Back to menu' }).click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: /New game Choose/ }).click();
    await page
      .getByPlaceholder('Leave blank for a random world')
      .fill('PIPELINE-QA');
    await page.getByRole('button', { name: 'Continue to character' }).click();
    await page.frameLocator('iframe').locator('#startBtn').click();
    let game = page.frames().find((f) => f.url() === 'about:srcdoc');
    await game.waitForFunction(() => G?.player);
    await page.frameLocator('iframe').locator('#menuRun').click();
    await game.evaluate((creature) => {
      for (let i = 0; i < 200; i++) {
        const p = randomWildPoint();
        if (!p) continue;
        const target = p.clone().addScaledVector(cameraForward(), 9);
        target.y = heightAt(target.x, target.z);
        if (
          inGrid(...worldToCell(target)) &&
          !noSpawnAt(target) &&
          !blockedAt(target.x, target.z, target.y, 0.6, 1.6, 'nav')
        ) {
          G.player.pos.copy(p);
          const enemy = wildernessSpawn(target, 'grunt');
          if (!enemy || enemy.type !== creature.id)
            throw Error(
              'Installed creature did not enter wilderness encounters automatically.',
            );
          return;
        }
      }
      throw Error('No spawn test position.');
    }, asset.creature);
    await game.waitForFunction((id) => {
      const e = G.enemies.find((item) => item.type === id);
      return e && forgeModels.get(e.mesh)?.state === 'generated';
    }, asset.creature.id);
    if (asset.report.clips.includes('attack')) {
      await game.evaluate(async (id) => {
        const e = G.enemies.find((e) => e.type === id),
          rig = forgeModels.get(e.mesh);
        e.forgeAnimationReady = true;
        forgeActions.delete(e);
        rig.setAnimation('idle', true);
        e.mesh.rotation.y = 0;
        const target = { hp: 100, pos: e.pos.clone().add(V3(0, 0, 1)) };
        if (!forgedEnemyAttack(e, target) || target.hp !== 100)
          throw Error('Attack damaged before impact');
        const at = forgeAttacks.get(e).at;
        G.time = at - 0.01;
        updatePlayer(0);
        if (target.hp !== 100) throw Error('Attack landed early');
        G.time = at + 0.01;
        updatePlayer(0);
        if (target.hp !== 100 - e.d.dmg) throw Error('Attack failed at impact');
        updatePlayer(0);
        if (target.hp !== 100 - e.d.dmg) throw Error('Impact applied twice');
        forgeActions.delete(e);
        e.forgePivoting = false;
        rig.setAnimation('idle', true);
        e.mesh.rotation.y = 0;
        const factor = steerForgedEnemy(e, V3(0, 0, -1), 0.1, e.d.spd);
        if (
          factor !== 0 ||
          Math.abs(e.mesh.rotation.y) > rig.turning.maxTurnSpeed * 0.1 + 1e-6
        )
          throw Error('Reversal spun or moved instantly');
        e.forgePivoting = false;
        rig.setAnimation('idle', true);
        const victim = frontierSpawnAt(e.pos.clone().add(V3(2, 0, 0)), id);
        const deathRig = forgeModels.get(victim.mesh);
        for (let i = 0; i < 100 && deathRig.state !== 'generated'; i++)
          await new Promise((r) => setTimeout(r, 20));
        damage(victim, victim.hp + 1000);
        if (
          !victim.dead ||
          victim.mesh.parent !== G.world ||
          deathRig.motion !== 'death'
        )
          throw Error('Death model removed before animation');
        for (let t = 0; t < deathRig.animationDuration('death') + 0.7; t += 0.1)
          updatePlayer(0.1);
        if (victim.mesh.parent === G.world || forgeModels.has(victim.mesh))
          throw Error('Death model was not cleaned up');
      }, asset.creature.id);
    }
    assert(await game.evaluate(() => window.bastion.save()));
    await page.reload();
    if (await page.getByRole('button', { name: 'Back to menu' }).count())
      await page.getByRole('button', { name: 'Back to menu' }).click();
    await page.getByRole('button', { name: /Load saved game/ }).click();
    game = page.frames().find((f) => f.url() === 'about:srcdoc');
    await game.waitForFunction((id) => {
      const e = G?.enemies?.find((item) => item.type === id);
      return e && forgeModels.get(e.mesh)?.state === 'generated';
    }, asset.creature.id);
    assert.deepEqual(errors, []);
    console.log(
      'Generated GLB browser checks passed: animated independent skins, shared geometry, private hit materials, checksum rejection, UI/mobile, actual enemy and fresh save restore.',
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
