/* eslint-disable typescript/no-require-imports -- Standalone CommonJS browser test. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const {
  chromium,
} = require('C:/Users/jchox/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const html = fs.readFileSync('playable/last-bastion-world-lab.html');
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(html);
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
      viewport: { width: 1280, height: 800 },
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('button', { name: /New game Choose/ }).click();
    await page
      .getByPlaceholder('Leave blank for a random world')
      .fill('PACE-QA');
    await page.getByRole('button', { name: 'Continue to character' }).click();
    await page.frameLocator('iframe').locator('#startBtn').click();
    const game = page.frames().find((f) => f.url() === 'about:srcdoc');
    await game.waitForFunction(() => G?.player);
    const result = await game.evaluate(async () => {
      menuPaused = true;
      const root = G.terrain,
        old = new Map(root.userData.chunks),
        origin = G.player.pos.clone();
      G.player.pos.x += 100;
      streamPlateauTerrain(0);
      const partial =
        !!G.terrainChunkJob && root.userData.chunks.size === old.size;
      const samples = [];
      for (let i = 0; i < 1200; i++) {
        await new Promise(requestAnimationFrame);
        const start = performance.now();
        streamPlateauTerrain();
        samples.push(performance.now() - start);
        if (
          !G.terrainChunkJob &&
          !G.terrainQueue.length &&
          G.groundCenter.equals(G.player.pos)
        )
          break;
      }
      const complete = !G.terrainChunkJob && !G.terrainQueue.length;
      G.player.pos.copy(origin);
      G.uiNext = 0;
      updateCombatUI();
      const observer = new MutationObserver(() => {});
      observer.observe($('combatBar'), {
        subtree: true,
        attributes: true,
        childList: true,
        characterData: true,
      });
      for (let i = 0; i < 20; i++) updateCombatUI();
      const skippedMutations = observer.takeRecords().length;
      G.uiNext = 0;
      updateCombatUI();
      const immediateMutations = observer.takeRecords().length;
      observer.disconnect();
      setView('third');
      updateCamera();
      renderer.render(scene, camera);
      return {
        partial,
        complete,
        retained:
          G.terrain === root &&
          [...old].some(([k, m]) => root.userData.chunks.get(k) === m),
        chunks: root.userData.chunks.size,
        maxStreamingMs: Math.max(...samples),
        frames: samples.length,
        skippedMutations,
        immediateMutations,
      };
    });
    assert(result.partial && result.complete && result.retained);
    assert(result.chunks <= 121);
    assert.equal(result.skippedMutations, 0);
    assert(result.immediateMutations > 0);
    await page.screenshot({ path: 'work/lag-spikes-browser.png' });
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      'work/lag-spikes-browser.json',
      JSON.stringify(result, null, 2),
    );
    console.log(
      'PASS browser streaming, rendering, HUD mutation throttling and error checks',
      result,
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
