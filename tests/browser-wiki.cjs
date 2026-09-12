/* eslint-disable typescript/no-require-imports -- Uses the existing CommonJS browser harness convention. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
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
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    await page.getByRole('button', { name: /Game wiki/ }).click();
    await page
      .getByRole('heading', { name: 'Start here', exact: true })
      .waitFor();
    assert.equal(
      await page.locator('iframe').count(),
      0,
      'Wiki works without starting a game',
    );
    assert.equal(
      await page
        .getByRole('navigation', { name: 'Wiki chapters' })
        .getByRole('link')
        .count(),
      15,
    );
    await page.screenshot({ path: 'work/wiki-desktop.png' });
    await page
      .getByRole('searchbox', { name: 'Search the wiki' })
      .fill('snare');
    await page.getByRole('button').filter({ hasText: 'Ranger moves' }).click();
    await page
      .getByRole('heading', { name: 'Classes and abilities', exact: true })
      .waitFor();
    assert(page.url().endsWith('#wiki/classes-and-abilities/ranger-moves'));
    await page.goBack();
    await page
      .getByRole('heading', { name: 'Start here', exact: true })
      .waitFor();
    await page.goForward();
    await page
      .getByRole('heading', { name: 'Classes and abilities', exact: true })
      .waitFor();
    await page
      .getByRole('searchbox', { name: 'Search the wiki' })
      .fill('zzznomatch987');
    await page.getByRole('heading', { name: 'No matching sections' }).waitFor();
    await page
      .getByRole('button', { name: 'Clear search', exact: true })
      .first()
      .click();
    await page
      .getByRole('navigation', { name: 'Wiki chapters' })
      .getByRole('link', { name: 'Building catalog' })
      .click();
    await page.reload();
    await page
      .getByRole('heading', { name: 'Building catalog', exact: true })
      .waitFor();
    const data = await page.locator('.wiki-reading').evaluate((el) => ({
      width: el.clientWidth,
      tables: el.querySelectorAll('table').length,
      background: getComputedStyle(el).backgroundImage,
    }));
    assert(
      data.tables >= 2 && data.background !== 'none',
      'Wiki styles are embedded in standalone build',
    );
    await page.screenshot({ path: 'work/wiki-catalog.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole('heading', { name: 'Building catalog', exact: true })
      .scrollIntoViewIfNeeded();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      'Mobile page has no horizontal overflow',
    );
    assert(
      await page
        .locator('.wiki-table-scroll')
        .first()
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      'Wide tables scroll inside their own container',
    );
    await page.screenshot({ path: 'work/wiki-mobile.png' });
    await page.getByRole('button', { name: 'Main menu', exact: true }).click();
    await page.getByRole('button', { name: /Game wiki/ }).waitFor();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: /New game Choose/ }).click();
    await page
      .getByPlaceholder('Leave blank for a random world')
      .fill('WIKI-QA');
    await page.getByRole('button', { name: 'Continue to character' }).click();
    await page.frameLocator('iframe').locator('#startBtn').click();
    const game = page.frames().find((f) => f.url() === 'about:srcdoc');
    await game.waitForFunction(() => G?.player);
    await game.evaluate(() => {
      window.wikiTestSession = { g: G, player: G.player, world: G.world };
    });
    await page.frameLocator('iframe').locator('#menuRun').click();
    const pausedTime = await game.evaluate(() => G.time);
    await page.getByRole('button', { name: /Game wiki/ }).click();
    await page
      .getByRole('heading', { name: 'Start here', exact: true })
      .waitFor();
    await page
      .getByRole('navigation', { name: 'Wiki chapters' })
      .getByRole('link', { name: 'Residents and staffing' })
      .click();
    await page.waitForTimeout(350);
    assert.equal(
      await game.evaluate(() => G.time),
      pausedTime,
      'Reading keeps the run paused',
    );
    await page.getByRole('button', { name: 'Main menu', exact: true }).click();
    assert(
      await page
        .getByRole('button', { name: /Game wiki/ })
        .evaluate((el) => el === document.activeElement),
      'Closing restores keyboard focus',
    );
    await page.getByRole('button', { name: /Resume game/ }).click();
    await game.waitForFunction((t) => G.time > t, pausedTime);
    assert(
      await game.evaluate(
        () =>
          G === window.wikiTestSession.g &&
          G.player === window.wikiTestSession.player &&
          G.world === window.wikiTestSession.world,
      ),
      'Reading never replaces the active session',
    );
    const offline = await browser.newPage();
    offline.on('pageerror', (e) => errors.push(e.message));
    await offline.route(/^https?:/, (route) => route.abort());
    await offline.goto(
      pathToFileURL(path.resolve('playable/last-bastion-world-lab.html')).href +
        '#wiki/classes-and-abilities',
    );
    await offline
      .getByRole('heading', { name: 'Classes and abilities', exact: true })
      .waitFor();
    await offline
      .getByRole('searchbox', { name: 'Search the wiki' })
      .fill('stamina');
    await offline
      .getByRole('button')
      .filter({ hasText: 'Jumping, climbing, and stairs' })
      .waitFor();
    await offline.close();
    assert.deepEqual(errors, []);
    console.log(
      'PASS wiki menu access, full-text search, deep links/history, mobile layout, and paused-session preservation',
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
