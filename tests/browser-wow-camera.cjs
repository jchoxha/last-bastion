const {
  chromium,
} = require('C:/Users/jchox/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: [
      '--enable-webgl',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:4177/work/frontier-qa.html');
    await page.getByRole('button', { name: /New game Choose/ }).click();
    await page.getByRole('button', { name: 'Continue to character' }).click();
    const frame = page.frameLocator('iframe');
    await frame.locator('#startBtn').click();
    await frame.locator('#combatBar').waitFor({ state: 'visible' });
    const game = page
      .frames()
      .find((candidate) => candidate.url() === 'about:srcdoc');
    await game.evaluate(() => {
      G.view = 'third';
      G.phase = 'explore';
      G.enemies = [];
      G.cameraYaw = G.player.yaw;
      window.__originalClickWorld = clickWorld;
      window.__worldClicks = 0;
      clickWorld = () => window.__worldClicks++;
    });

    await page.mouse.move(700, 420);
    const initial = await game.evaluate(() => ({
      camera: G.cameraYaw,
      player: G.player.yaw,
    }));
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(860, 480, { steps: 8 });
    await page.mouse.up({ button: 'left' });
    const freeLook = await game.evaluate(() => ({
      camera: G.cameraYaw,
      player: G.player.yaw,
      clicks: window.__worldClicks,
    }));
    assert(Math.abs(freeLook.camera - initial.camera) > 0.2, 'LMB drag orbits');
    assert(
      Math.abs(freeLook.player - initial.player) < 0.01,
      'LMB drag preserves facing',
    );
    assert.equal(freeLook.clicks, 0, 'LMB drag does not cast');

    await page.mouse.click(700, 420);
    assert.equal(
      await game.evaluate(() => window.__worldClicks),
      1,
      'LMB click still acts',
    );
    await game.evaluate(() => {
      clickWorld = window.__originalClickWorld;
      delete window.__originalClickWorld;
    });

    await page.mouse.down({ button: 'right' });
    await page.mouse.move(860, 460, { steps: 8 });
    await page.mouse.up({ button: 'right' });
    const steered = await game.evaluate(() => ({
      camera: G.cameraYaw,
      player: G.player.yaw,
    }));
    assert(
      Math.abs(steered.camera - freeLook.camera) > 0.2,
      'RMB drag rotates camera',
    );
    assert(
      Math.abs(steered.camera - steered.player) < 0.01,
      'RMB drag steers character',
    );

    const beforeTurn = await game.evaluate(() => ({
      camera: G.cameraYaw,
      player: G.player.yaw,
    }));
    await page.keyboard.down('a');
    await page.waitForTimeout(500);
    await page.keyboard.up('a');
    const afterTurn = await game.evaluate(() => ({
      camera: G.cameraYaw,
      player: G.player.yaw,
    }));
    assert(Math.abs(afterTurn.camera - beforeTurn.camera) > 0.05, 'A turns');
    assert(
      Math.abs(
        afterTurn.camera -
          beforeTurn.camera -
          (afterTurn.player - beforeTurn.player),
      ) < 0.05,
      'A preserves the free-look offset',
    );

    const beforeStrafe = await game.evaluate(() => G.cameraYaw);
    await page.mouse.down({ button: 'right' });
    await page.keyboard.down('d');
    await page.waitForTimeout(500);
    await page.keyboard.up('d');
    await page.mouse.up({ button: 'right' });
    assert(
      Math.abs((await game.evaluate(() => G.cameraYaw)) - beforeStrafe) < 0.01,
      'RMB + D strafes without turning',
    );

    const beforeMove = await game.evaluate(() => G.player.pos.clone());
    await page.mouse.down({ button: 'left' });
    await page.mouse.down({ button: 'right' });
    await page.waitForTimeout(600);
    await page.mouse.up({ button: 'right' });
    await page.mouse.up({ button: 'left' });
    const distance = await game.evaluate(
      ({ x, y, z }) => G.player.pos.distanceTo(V3(x, y, z)),
      beforeMove,
    );
    assert(distance > 0.2, 'Both mouse buttons move forward');
    assert.deepEqual(errors, []);
    console.log('PASS Chromium: WoW-style third-person camera controls.');
  } finally {
    await browser.close();
  }
})();
