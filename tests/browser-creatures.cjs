/* eslint-disable typescript/no-require-imports -- Existing CommonJS browser harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  chromium,
} = require('C:/Users/jchox/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const server = http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(fs.readFileSync('playable/last-bastion-world-lab.html'));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
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
      viewport: { width: 1440, height: 1050 },
      acceptDownloads: true,
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('button', { name: /Creature forge/ }).click();
    await page
      .getByRole('heading', { name: 'Creature forge', exact: true })
      .waitFor();
    assert.equal(await page.locator('iframe').count(), 0);
    await page.locator('.forge-preview canvas').waitFor();
    await page.getByLabel('Generation seed').fill('CREATURE-BROWSER-QA');
    await page
      .getByRole('button', { name: 'Generate locally', exact: true })
      .click();
    await page.getByLabel('Show skeleton').check();
    await page.getByLabel('Preview motion').selectOption('walk');
    await page
      .getByRole('button', { name: 'Save to library', exact: true })
      .click();
    const saved = await page.evaluate(
      () => JSON.parse(localStorage.getItem('last-bastion-creatures-v1'))[0],
    );
    await page.screenshot({ path: 'work/forge-desktop.png', fullPage: true });
    await page
      .locator('summary')
      .filter({ hasText: 'Export and asset pipeline' })
      .click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export prototype GLB' }).click();
    const download = await downloading;
    await download.saveAs('work/creature-prototype.glb');
    const glb = fs.readFileSync('work/creature-prototype.glb');
    assert.equal(glb.toString('ascii', 0, 4), 'glTF');
    const gltf = JSON.parse(
      glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)),
    );
    assert(gltf.skins[0].joints.length >= 20);
    assert.deepEqual(gltf.animations.map((a) => a.name).sort(), [
      'idle',
      'walk',
    ]);
    for (const joint of [
      'front_paw_L',
      'front_paw_R',
      'rear_paw_L',
      'rear_paw_R',
    ])
      assert(gltf.nodes.some((n) => n.name === joint));
    await page.getByLabel('Import creature JSON').setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":99}'),
    });
    await page
      .getByText('Unsupported creature version.', { exact: true })
      .waitFor();
    assert.equal(
      await page.locator('.forge-result h2').textContent(),
      saved.spec.name,
    );
    await page.reload();
    await page.locator('.forge-library-list strong').waitFor();
    assert.equal(
      await page.locator('.forge-library-list strong').textContent(),
      saved.spec.name,
    );
    await page
      .getByLabel('Body type', { exact: true })
      .selectOption('Aberration');
    await page
      .getByRole('button', { name: 'Generate locally', exact: true })
      .click();
    await page.getByText('CONCEPT ONLY', { exact: true }).waitFor();
    assert(
      await page.getByRole('button', { name: 'Spawn test enemy' }).isDisabled(),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({ path: 'work/forge-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Back to menu' }).click();
    assert(
      await page
        .getByRole('button', { name: /Creature forge/ })
        .evaluate((el) => el === document.activeElement),
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: /New game Choose/ }).click();
    await page
      .getByPlaceholder('Leave blank for a random world')
      .fill('FORGE-QA');
    await page.getByRole('button', { name: 'Continue to character' }).click();
    await page.frameLocator('iframe').locator('#startBtn').click();
    let game = page.frames().find((frame) => frame.url() === 'about:srcdoc');
    await game.waitForFunction(() => G?.player);
    await page.frameLocator('iframe').locator('#menuRun').click();
    await game.evaluate(() => {
      for (let i = 0; i < 100; i++) {
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
          return;
        }
      }
      throw Error('No test position found.');
    });
    const paused = await game.evaluate(() => G.time);
    await page.getByRole('button', { name: /Creature forge/ }).click();
    await page.locator('.forge-library-list button').first().click();
    await page.getByRole('button', { name: 'Spawn test enemy' }).click();
    await page
      .locator('.forge-status')
      .filter({ hasText: 'spawned as a hostile test enemy' })
      .waitFor();
    const stats = await game.evaluate((id) => {
      const enemy = G.enemies.find((e) => e.type === id);
      return {
        hp: enemy.maxHp,
        damage: enemy.d.dmg,
        size: enemy.d.size,
        skin: enemy.body.isSkinnedMesh,
        saved: !!colony().species[id].forgeJson,
      };
    }, saved.id);
    assert.equal(stats.hp, saved.stats.hp);
    assert.equal(stats.damage, saved.stats.damage);
    assert(stats.skin && stats.saved);
    assert.equal(await game.evaluate(() => G.time), paused);
    assert(await game.evaluate(() => window.bastion.save()));
    await page.reload();
    await page.getByRole('button', { name: 'Back to menu' }).click();
    await page.getByRole('button', { name: /Load saved game/ }).click();
    game = page.frames().find((frame) => frame.url() === 'about:srcdoc');
    await game.waitForFunction(
      (id) => G?.enemies?.some((e) => e.type === id),
      saved.id,
    );
    assert(
      await game.evaluate(
        (id) => G.enemies.find((e) => e.type === id).body.isSkinnedMesh,
        saved.id,
      ),
    );
    await game.evaluate((id) => {
      const e = G.enemies.find((e) => e.type === id);
      const before = e.hp;
      damage(e, 3);
      if (!(e.hp < before)) throw Error('Generated enemy cannot take damage.');
    }, saved.id);
    const offline = await browser.newPage();
    offline.on('pageerror', (error) => errors.push(error.message));
    await offline.route(/^https?:/, (route) => route.abort());
    await offline.goto(
      pathToFileURL(path.resolve('playable/last-bastion-world-lab.html')).href +
        '#forge',
    );
    await offline
      .getByRole('button', { name: 'Generate locally', exact: true })
      .click();
    await offline.locator('.forge-preview canvas').waitFor();
    await offline.close();
    assert.deepEqual(errors, []);
    console.log(
      'Forge browser checks passed: UI, library, GLB export, concepts, mobile, spawning, fresh save restore, damage and offline generation.',
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
