// Run with Playwright available in Node's module path and `npm run dev` running.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const origin = process.env.TEST_URL || 'http://localhost:4173';
const THEMES = ['green', 'amber', 'cyan', 'magenta', 'white'];
let browser;
test.before(async () => { browser = await chromium.launch({ headless: true }); });
test.after(async () => { await browser.close(); });

const themeButton = (page) => page.locator('[data-terminal-theme-current]');

for (const blocked of ['fusion-pixel.woff2', 'three.module.js']) {
  test(`content and theme controls work while ${blocked} is stalled`, async () => {
    const page = await browser.newPage();
    try {
      await page.route('https://**', (route) => route.abort());
      await page.route((url) => url.href.includes(blocked), () => {});
      await page.goto(origin, { waitUntil: 'commit' });
      await page.waitForFunction(() => document.querySelectorAll('#projects-list .mail-row').length > 0,
        null, { timeout: 3000 });
      const before = await page.locator('html').getAttribute('data-terminal-theme');
      await themeButton(page).click();
      const after = await page.locator('html').getAttribute('data-terminal-theme');
      assert.equal(after, THEMES[(THEMES.indexOf(before) + 1) % THEMES.length]);
      const paints = await page.evaluate(() => performance.getEntriesByType('paint'));
      assert.ok(paints.length > 0, 'the page must paint before the stalled resource returns');
    } finally {
      await page.close();
    }
  });
}

test('snapshot sections render, including posts and sync times', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.route('https://**', (route) => route.abort());
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#posts-list .mail-row').length > 0);
    const data = await page.evaluate(() => fetch('./data/github.json').then((r) => r.json()));
    const firstTitle = await page.locator('#posts-list .mail-subject').first().innerText();
    assert.equal(firstTitle, data.blog.posts[0].title);
    assert.match(await page.locator('#sync-status').innerText(), /blog sync/);
    if (data.stats.posts) {
      assert.ok((await page.locator('#link-grid').innerText()).includes(`${data.stats.posts} 篇`));
    }
  } finally {
    await page.close();
  }
});

test('footer switches artwork with the theme and 3D waits for its section', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  try {
    await page.route('https://**', (route) => route.abort());
    await page.addInitScript(() => localStorage.setItem('terminal-theme', 'green'));
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelectorAll('#projects-list .mail-row').length > 0);
    assert.ok(!requests.some((url) => url.includes('contrib3d.js')));
    // Native lazy loading may prefetch while the data sections are still empty.
    assert.ok(!requests.some((url) => url.endsWith('hangzhou-west-lake.webp')));
    assert.ok(!requests.some((url) => url.includes('web-llm')));
    const artwork = page.locator('.terminal-footer img');
    for (const theme of [...THEMES.slice(1), 'green']) {
      await themeButton(page).click();
      assert.equal(await themeButton(page).getAttribute('title'), `terminal-${theme}`);
      const suffix = theme === 'white' ? 'west-lake.webp' : 'west-lake-dark.webp';
      assert.ok((await artwork.getAttribute('src')).endsWith(suffix));
    }
    await page.evaluate(() => document.querySelector('#activity').scrollIntoView({ behavior: 'instant' }));
    await page.waitForFunction(() => performance.getEntriesByType('resource').some((r) => r.name.endsWith('contrib3d.js')));
  } finally {
    await page.close();
  }
});
