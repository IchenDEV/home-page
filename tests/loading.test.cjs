// Run with Playwright available in Node's module path and `npm run dev` running.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const origin = process.env.TEST_URL || 'http://localhost:4173';
let browser;
test.before(async () => { browser = await chromium.launch({ headless: true }); });
test.after(async () => { await browser.close(); });

for (const blocked of ['fonts.googleapis.com', 'three.module.js']) {
  test(`content and theme controls work while ${blocked} is stalled`, async () => {
    const page = await browser.newPage();
    try {
      await page.route('https://**', (route) => route.abort());
      await page.route((url) => url.href.includes(blocked), () => {});
      await page.goto(origin, { waitUntil: 'commit' });
      await page.waitForFunction(() => document.querySelectorAll('#projects-grid .card').length > 0,
        null, { timeout: 3000 });
      await page.getByRole('button', { name: 'terminal-white', exact: true }).click();
      assert.equal(await page.locator('html').getAttribute('data-terminal-theme'), 'white');
      const paints = await page.evaluate(() => performance.getEntriesByType('paint'));
      assert.ok(paints.length > 0, 'the page must paint before the stalled resource returns');
    } finally {
      await page.close();
    }
  });
}

test('footer switches artwork with the theme and 3D waits for its section', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  try {
    await page.route('https://**', (route) => route.abort());
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#projects-grid .card').length > 0);
    assert.ok(!requests.some((url) => url.includes('contrib3d.js')));
    // Native lazy loading may prefetch while the data sections are still empty.
    assert.ok(!requests.some((url) => url.endsWith('hangzhou-west-lake.webp')));
    assert.ok(!requests.some((url) => url.includes('web-llm')));
    const artwork = page.locator('.footer-landscape img');
    for (const theme of ['green', 'white', 'amber', 'cyan', 'magenta']) {
      await page.getByRole('button', { name: `terminal-${theme}`, exact: true }).click();
      const suffix = theme === 'white' ? 'west-lake.webp' : 'west-lake-dark.webp';
      assert.ok((await artwork.getAttribute('src')).endsWith(suffix));
    }
    assert.ok(!(await page.locator('.site-footer').innerText()).includes('写代码，也看山水'));
    await page.evaluate(() => document.querySelector('#contrib').scrollIntoView({ behavior: 'instant' }));
    await page.waitForFunction(() => performance.getEntriesByType('resource').some((r) => r.name.endsWith('contrib3d.js')));
  } finally {
    await page.close();
  }
});
