/* eslint-disable typescript/no-require-imports -- Local Chrome harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const {
  chromium,
} = require('C:/Users/jchox/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const server = http.createServer((req, res) => {
    if (req.url.includes('creatures/')) {
      res.setHeader('Content-Type', 'application/json');
      res.end('{"version":1,"assets":[]}');
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end(fs.readFileSync('playable/last-bastion-world-lab.html'));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
    });
    const errors = [],
      submissions = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://api.github.com/**', async (route) => {
      const request = route.request();
      assert.equal(request.headers().authorization, 'Bearer github_test_only');
      const url = new URL(request.url());
      let body = {};
      if (url.pathname === '/user') body = { login: 'jchoxha' };
      else if (url.pathname.endsWith('/runs'))
        body = {
          workflow_runs: [
            {
              id: 12345,
              run_number: 1,
              status: 'completed',
              conclusion: 'failure',
            },
          ],
        };
      else if (url.pathname.endsWith('/dispatches')) {
        submissions.push(request.postDataJSON());
        await route.fulfill({ status: 204 });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/#forge`);
    const panel = page.getByRole('region', {
      name: 'GitHub creature generation',
      exact: true,
    });
    await panel
      .getByLabel('GitHub token (not your Tripo key)')
      .fill('github_test_only');
    await panel
      .getByRole('button', { name: 'Connect GitHub', exact: true })
      .click();
    await panel
      .getByRole('button', { name: 'Disconnect GitHub', exact: true })
      .waitFor();
    assert.equal(await panel.getByLabel('Model source').inputValue(), 'text');
    await panel
      .getByRole('button', {
        name: 'Generate and publish creature',
        exact: true,
      })
      .click();
    await page.waitForFunction(() =>
      document.body.textContent.includes('Job submitted.'),
    );
    assert.equal(submissions.length, 1);
    const request = JSON.parse(submissions[0].inputs.request);
    assert.equal(request.mode, 'text');
    assert.equal(request.rosterId, 'voltfang');
    assert.equal(submissions[0].ref, 'main');
    assert(!JSON.stringify(submissions).includes('github_test_only'));
    assert(
      await panel
        .getByRole('button', {
          name: 'Generate and publish creature',
          exact: true,
        })
        .isDisabled(),
    );
    const storage = await page.evaluate(() =>
      JSON.stringify([localStorage, sessionStorage]),
    );
    assert(!storage.includes('github_test_only'));
    await panel.getByRole('button', { name: 'Prepare another job' }).click();
    await panel.getByRole('button', { name: 'Resume saved tasks' }).click();
    await page.waitForTimeout(100);
    assert.equal(submissions[1].inputs.resume_run_id, '12345');
    await panel
      .getByRole('button', { name: 'Disconnect GitHub', exact: true })
      .click();
    assert.equal(
      await panel.getByLabel('GitHub token (not your Tripo key)').inputValue(),
      '',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: 'work/creature-cloud-mobile.png',
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      'PASS cloud form dispatch, token isolation, duplicate-click guard, recovery, disconnect and mobile layout',
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
