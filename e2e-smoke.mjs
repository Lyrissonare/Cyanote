/* E2E smoke test for Cyanote using puppeteer-core + a local browser.
   Run against a live server (default http://localhost:3810, override with E2E_BASE).
   Public site: /   ·   Admin console (hidden): /admin (views: posts/editor/categories/tags/settings)
   Browser: auto-detects Chrome / Edge / Chromium; override with CHROME_PATH.
   Admin token: from CYANOTE_TOKEN, or the auto-generated data/admin-token file. */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.E2E_BASE || 'http://localhost:3810';
const SHOTS = path.resolve('e2e-shots');
fs.mkdirSync(SHOTS, { recursive: true });

function resolveAdminToken() {
  const fromEnv = (process.env.CYANOTE_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const saved = fs.readFileSync(path.resolve('data/admin-token'), 'utf8').trim();
    if (saved) return saved;
  } catch {
    /* not generated yet */
  }
  console.error('✖ 未找到管理令牌：请设置 CYANOTE_TOKEN，或先启动一次服务以生成 data/admin-token');
  process.exit(1);
}

function findBrowser() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const pf = process.env['ProgramFiles'];
  const pf86 = process.env['ProgramFiles(x86)'];
  const localAppData = process.env['LocalAppData'];
  const candidates =
    process.platform === 'win32'
      ? [
          pf && `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
          pf86 && `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
          localAppData && `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
          pf && `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
          pf86 && `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
          localAppData && `${localAppData}\\Microsoft\\Edge\\Application\\msedge.exe`,
          localAppData && `${localAppData}\\Chromium\\Application\\chrome.exe`,
        ]
      : process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
            '/usr/bin/microsoft-edge',
            '/usr/bin/microsoft-edge-stable',
          ];
  return candidates.filter(Boolean).find((p) => fs.existsSync(p));
}

const TOKEN = resolveAdminToken();
const BROWSER = findBrowser();
if (!BROWSER) {
  console.error('✖ 未找到 Chrome / Edge / Chromium，可设置 CHROME_PATH 指定浏览器可执行文件路径');
  process.exit(1);
}
console.log(`Browser: ${BROWSER}`);
const AUTH = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

// The smoke run issues a burst of API calls; relax rate limits for the run and
// restore the protection level at the end (if the run crashes hard, flip it
// back in 管理台 → 站点设置).
try {
  await fetch(`${BASE}/api/settings`, { method: 'PUT', headers: AUTH, body: JSON.stringify({ protectionLevel: 'low' }) });
} catch {
  console.log('（无法调整防护等级，若服务刚重启且正处限流窗口，稍后重试）');
}

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: true,
  args: ['--no-first-run', '--disable-extensions', '--window-size=1440,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

/* ============ HOME ============ */
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForSelector('.hero', { timeout: 8000 });
check('home: hero without eyebrow badge & write CTA', !(await page.$('.hero-eyebrow')) && !(await page.$eval('.hero-actions', (e) => e.textContent)).includes('写'));
const stats = await page.$$eval('.stat-cell b', (els) => els.map((e) => e.textContent));
check('home: Butterfly stats widget', stats.length === 4, stats.join('/'));
check('home: future switch in sidebar', !!(await page.$('#sidebar-slot #future-switch')));
const fullCards = await page.$$eval('.layout-main > .post-card', (els) => els.length);
check('home: N full recent cards (default 3)', fullCards === 3, `${fullCards} cards`);
check('home: ghost card with glow present', !!(await page.$('.fade-card-wrap .fade-glow')) && !!(await page.$('.fade-card-wrap .fade-card-link .fade-cta')));
check('ghost card links to all posts', !!(await page.$('.fade-card-link[href="#/posts"]')));
// word count at bottom-right of cards
const homeWords = await page.$$eval('.layout-main > .post-card .words', (els) => els.map((e) => e.textContent.trim()));
check('post cards show word count (home)', homeWords.length === 3 && homeWords.every((t) => /^\d+ 字$/.test(t)), homeWords.join(', '));

// cursor-following light (shrunk size check via computed style)
const glowSize = await page.$eval('#cursor-glow', (el) => getComputedStyle(el).width);
const glowBefore = await page.$eval('#cursor-glow', (el) => el.style.transform);
await page.mouse.move(420, 320);
await sleep(350);
const glowAfter = await page.$eval('#cursor-glow', (el) => el.style.transform);
check('cursor glow follows mouse', glowBefore !== glowAfter && /translate3d/.test(glowAfter), glowAfter.slice(0, 34));
check('cursor glow size reduced', parseInt(glowSize) <= 400, glowSize);

/* ============ ABOUT ============ */
await page.goto(`${BASE}/#/about`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.about-article');
check('about page renders content', (await page.$eval('.about-article', (e) => e.textContent)).includes('关于 Cyanote'));

/* ============ THEME + FUTURE + CONFLICT ============ */
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.hero');
const theme0 = await page.$eval('html', (h) => h.dataset.theme);
await page.click('#theme-toggle');
check('theme toggle switches dark<->light', (await page.$eval('html', (h) => h.dataset.theme)) !== theme0);
await page.click('#theme-toggle');
await page.click('#future-switch');
check('sidebar future switch toggles on', await page.evaluate(() => document.body.classList.contains('future-mode')));
await page.screenshot({ path: path.join(SHOTS, 'home-future.png') });
await page.click('#theme-toggle');
await sleep(300);
check('conflict note appears in light + future', await page.$eval('.conflict-note', (n) => !n.hidden && n.offsetParent !== null));
await page.click('#conflict-to-dark');
await sleep(300);
check('conflict note one-click fixes theme', (await page.$eval('html', (h) => h.dataset.theme)) === 'dark');
await page.click('#future-switch');
check('sidebar future switch toggles off', !(await page.evaluate(() => document.body.classList.contains('future-mode'))));

/* ============ POSTS / ARTICLE / PAGES ============ */
await page.goto(`${BASE}/#/posts`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.post-card');
// sidebar renders from two parallel fetches — wait for it before counting
await page.waitForFunction(() => document.querySelectorAll('.widget').length >= 5, { timeout: 8000 });
check('posts list + 5 sidebar widgets', (await page.$$('.widget')).length === 5);
await page.type('#post-search', 'Node');
await sleep(900);
const sr = await page.$$eval('.post-card', (cards) => cards.map((c) => (c.textContent || '').replace(/\s+/g, ' ')));
check('posts search filters by q', sr.length >= 1 && sr.every((t) => t.toLowerCase().includes('node')), `${sr.length} match(es)`);
check('posts cards word count', await page.$$eval('.post-card .words', (els) => els.length >= 1));
await page.goto(`${BASE}/#/post/hello-cyanote`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.article-body');
check('article: headings/TOC/highlight', (await page.$$('.article-body h2')).length >= 3 && (await page.$$('.toc a')).length >= 3 && (await page.$$('.article-body .token.keyword')).length >= 1);
// TOC: click must smooth-scroll and must NOT navigate away (hash router)
await page.click('.toc a[data-toc]');
await sleep(800);
const tocUrl = page.url();
const tocY = await page.evaluate(() => window.scrollY);
check('toc click scrolls without leaving article', tocUrl.includes('#/post/hello-cyanote') && tocY > 100, `scrollY=${Math.round(tocY)}`);
// single sticky column: toc + sidebar move together (no double-stick overlap)
const tocSide = await page.evaluate(() => {
  const side = document.querySelector('.article-side');
  const tocEl = document.querySelector('.toc');
  const sb = document.querySelector('.article-side .sidebar');
  return {
    sideSticky: getComputedStyle(side).position,
    tocSticky: getComputedStyle(tocEl).position,
    sidebarStatic: getComputedStyle(sb).position,
    siblings: side.querySelector('.toc') && side.querySelector('#sidebar-slot'),
  };
});
check('article side is single sticky column', tocSide.sideSticky === 'sticky' && tocSide.sidebarStatic === 'static' && tocSide.siblings, JSON.stringify(tocSide).slice(0, 80));
await page.goto(`${BASE}/#/categories`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.cat-group');
check('categories page groups', (await page.$$('.cat-group')).length >= 2);
await page.goto(`${BASE}/#/tags`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.tags-hero a');
check('tags page cloud', (await page.$$('.tags-hero a')).length >= 10);
await page.goto(`${BASE}/#/archive`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.year-group');
check('archive groups', (await page.$$('.month-block')).length >= 2);

/* ============ ADMIN: LOGIN + 文章管理 ============ */
// anti-flash: inline head script must set the theme even with theme.js blocked
// (separate page so interception never disturbs the main test page)
const expectedTheme = await page.$eval('html', (h) => h.dataset.theme);
{
  const probe = await browser.newPage();
  await probe.setRequestInterception(true);
  probe.on('request', (req) => {
    if (/\/js\/(main|theme)\.js/.test(req.url())) req.abort();
    else req.continue();
  });
  await probe.goto(`${BASE}/admin/?view=posts`, { waitUntil: 'domcontentloaded' });
  const preJsTheme = await probe.$eval('html', (h) => h.dataset.theme);
  check('admin theme set before JS (no white flash)', preJsTheme === expectedTheme, preJsTheme);
  await probe.close();
}

await page.goto(`${BASE}/admin/`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.editor-login');
check('admin gate login shown', true);
check('admin has noindex', (await page.$eval('meta[name="robots"]', (m) => m.content)) === 'noindex, nofollow');
await page.type('#login-token', TOKEN);
await page.click('#login-btn');
await page.waitForSelector('.mng-card', { timeout: 8000 });
check('admin defaults to article management', (await page.$$('.mng-row')).length >= 5);
check('admin nav has all views', (await page.$$('.admin-nav a')).length === 5);

// status filter first (reset to all afterwards), then search
await page.click('#mng-filter button[data-status="draft"]');
await sleep(300);
const draftPills = await page.$$eval('.mng-row .status-pill', (els) => els.map((e) => e.textContent.trim()));
check('article mgmt draft filter', draftPills.length >= 1 && draftPills.every((t) => t.includes('草稿')), `${draftPills.length} rows`);
await page.click('#mng-filter button[data-status="all"]');
await sleep(300);
await page.type('#mng-search', 'Node');
await sleep(700);
const rowsFiltered = (await page.$$('.mng-row')).length;
check('article mgmt search filters rows', rowsFiltered >= 1 && rowsFiltered < 6, `${rowsFiltered} rows`);
await page.$eval('#mng-search', (i) => { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(500);

// publish / unpublish a draft from the list
await page.click('.mng-row[data-slug="refactor-plan-draft"] [data-act="toggle-publish"]');
await sleep(1000);
const pill = await page.$eval('.mng-row[data-slug="refactor-plan-draft"] .status-pill', (e) => e.textContent.trim());
check('article mgmt publish draft', pill.includes('已发布'), pill);
await page.click('.mng-row[data-slug="refactor-plan-draft"] [data-act="toggle-publish"]');
await sleep(1000);
const pill2 = await page.$eval('.mng-row[data-slug="refactor-plan-draft"] .status-pill', (e) => e.textContent.trim());
check('article mgmt unpublish back to draft', pill2.includes('草稿'), pill2);

// edit entry point
await page.click('.mng-row[data-slug="hello-cyanote"] a[href*="view=editor"]');
await page.waitForSelector('#editor-content', { timeout: 8000 });
check('mng edit opens editor with article', (await page.$eval('#post-title', (e) => e.value)).includes('Cyanote'));
// nav switching from the editor view must remount the target view
await page.click('.admin-nav a[data-view="categories"]');
await page.waitForSelector('.mng-rename', { timeout: 8000 });
check('admin nav switches views from editor', true);

/* ============ ADMIN: 分类管理 / 标签管理 ============ */
await page.goto(`${BASE}/admin/?view=categories`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.mng-rename');
await page.$eval('.mng-row[data-name="技术"] .mng-rename', (i) => { i.value = '技术同步测试'; });
await page.click('.mng-row[data-name="技术"] [data-act="rename"]');
await sleep(900);
let meta = await (await fetch(`${BASE}/api/meta`)).json();
check('category rename syncs to meta', meta.categories.some((c) => c.name === '技术同步测试'));
check('category rename keeps counts', meta.categories.find((c) => c.name === '技术同步测试').count === 3, '');
await page.$eval('.mng-row[data-name="技术同步测试"] .mng-rename', (i) => { i.value = '技术'; });
await page.click('.mng-row[data-name="技术同步测试"] [data-act="rename"]');
await sleep(900);

await page.goto(`${BASE}/admin/?view=tags`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.mng-rename');
await page.$eval('.mng-row[data-name="Node.js"] .mng-rename', (i) => { i.value = 'Node.js测试'; });
await page.click('.mng-row[data-name="Node.js"] [data-act="rename"]');
await sleep(900);
meta = await (await fetch(`${BASE}/api/meta`)).json();
check('tag rename syncs to meta', meta.tags.some((t) => t.name === 'Node.js测试'));
await page.$eval('.mng-row[data-name="Node.js测试"] .mng-rename', (i) => { i.value = 'Node.js'; });
await page.click('.mng-row[data-name="Node.js测试"] [data-act="rename"]');
await sleep(900);

// category delete end-to-end (temp category via API, delete via UI)
const tmpPost = await (
  await fetch(`${BASE}/api/articles`, {
    method: 'POST',
    headers: AUTH,
    body: JSON.stringify({ title: '临时分类测试文章', slug: 'tmp-cat-article', content: 'x', categories: ['待删分类x'], tags: [], status: 'published' }),
  })
).json();
await page.goto(`${BASE}/admin/?view=categories`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.mng-row[data-name="待删分类x"]');
page.once('dialog', (d) => d.accept());
await page.click('.mng-row[data-name="待删分类x"] [data-act="remove"]');
await sleep(1000);
meta = await (await fetch(`${BASE}/api/meta`)).json();
const tmpAfter = await (await fetch(`${BASE}/api/articles/tmp-cat-article`)).json();
check('category delete removes from articles', !meta.categories.some((c) => c.name === '待删分类x') && tmpAfter.categories.length === 0);
await fetch(`${BASE}/api/articles/tmp-cat-article`, { method: 'DELETE', headers: AUTH });

/* ============ ADMIN: 站点设置（独立视图） ============ */
await page.goto(`${BASE}/admin/?view=settings`, { waitUntil: 'networkidle0' });
await page.waitForSelector('#set-recent-count');
await page.$eval('#set-recent-count', (i) => { i.value = '5'; });
await page.click('#settings-save');
await sleep(900);
const settingsNow = await (await fetch(`${BASE}/api/settings`)).json();
check('settings view saves count', settingsNow.homeRecentCount === '5', settingsNow.homeRecentCount);
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.hero');
// 库里已发布文章可能少于 5 篇：期望卡片数 = min(5, 已发布总数)
const totalPublished = (await (await fetch(`${BASE}/api/articles?pageSize=1`)).json()).total;
const expectedRecent = Math.min(5, totalPublished);
check('home honors configurable recent count (5)', (await page.$$eval('.layout-main > .post-card', (els) => els.length)) === expectedRecent, `${expectedRecent} expected`);
await page.screenshot({ path: path.join(SHOTS, 'home-count5.png') });
await fetch(`${BASE}/api/settings`, { method: 'PUT', headers: AUTH, body: JSON.stringify({ homeRecentCount: 3 }) });

/* ============ ADMIN: 写文章（编辑器全流程） ============ */
await page.goto(`${BASE}/admin/?view=editor`, { waitUntil: 'networkidle0' });
await page.waitForSelector('#editor-content', { timeout: 8000 });
check('admin editor body', true);

const tbCount = (await page.$$('.tb-btn')).length;
check('toolbar renders all quick buttons', tbCount === 16, `${tbCount} buttons`);
await page.type('#post-title', 'E2E 自动化测试文章');
await page.click('.tb-btn[data-cmd="h2"]');
await page.click('.tb-btn[data-cmd="bold"]');
await page.type('#editor-content', 'E2E 正文内容');
const afterBold = await page.$eval('#editor-content', (e) => e.value);
check('toolbar h2 + bold insert markdown', afterBold.includes('## **E2E 正文内容**'), JSON.stringify(afterBold));
await page.click('.tb-btn[data-cmd="undo"]');
check('toolbar undo reverts last edit', (await page.$eval('#editor-content', (e) => e.value)) !== afterBold);
await page.click('.tb-btn[data-cmd="redo"]');
check('toolbar redo restores edit', (await page.$eval('#editor-content', (e) => e.value)) === afterBold);
await page.$eval('#editor-content', (ta) => {
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
});
await page.type('#editor-content', '\n\n这是 **实时预览** 测试。\n\n```js\nconst ok = true;\n```\n\n- 项目一\n- 项目二\n');
await sleep(700);
const previewText = await page.$eval('#editor-preview-body', (e) => e.textContent);
check('live preview renders markdown', previewText.includes('实时预览'), '');
check('preview syntax highlight', (await page.$$('#editor-preview-body .token.keyword')).length >= 1);

// image paste upload
const pasted = await page.evaluate(async () => {
  const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const bytes = Uint8Array.from(atob(pngB64), (c) => c.charCodeAt(0));
  const file = new File([bytes], 'pasted.png', { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(file);
  const ta = document.querySelector('#editor-content');
  ta.focus();
  ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 2500));
  return ta.value;
});
check('paste image uploads + inserts markdown', /!\[[^\]]+\]\(\/uploads\/[^)]+\)/.test(pasted));
await sleep(600);
check('uploaded image visible in live preview', (await page.$$('#editor-preview-body img')).length >= 1);

await page.click('.view-tab[data-mode="preview"]');
check('view switch to preview', await page.$eval('.editor-pane', (p) => p.classList.contains('mode-preview')));
await page.click('.view-tab[data-mode="edit"]');

await page.click('#btn-save');
await sleep(1200);
check('save shows saved state', (await page.$eval('#save-state', (e) => e.lastElementChild.textContent)).includes('已'));
await page.click('#btn-publish');
await sleep(1500);
const search = await page.evaluate(() => location.search);
const pubSlug = new URLSearchParams(search).get('slug') || '';
check('admin URL updated with view+slug', search.includes('view=editor') && pubSlug.length > 3, pubSlug);

// published article readable + renders
try {
  const pub = await (await fetch(`${BASE}/api/articles/${pubSlug}`)).json();
  check('published article readable via API', pub.title === 'E2E 自动化测试文章' && pub.status === 'published', pub.title);
  await page.screenshot({ path: path.join(SHOTS, 'editor-public.png') });
  await page.goto(`${BASE}/#/post/${encodeURIComponent(pubSlug)}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.article-body h2', { timeout: 8000 });
  check('new article renders on public page', (await page.$eval('.article-title', (e) => e.textContent.trim())) === 'E2E 自动化测试文章', '');
  await page.screenshot({ path: path.join(SHOTS, 'article-e2e.png') });
} finally {
  await fetch(`${BASE}/api/articles/${pubSlug}`, { method: 'DELETE', headers: AUTH });
}

/* ============ ADMIN: 文章管理删除入口 ============ */
const tmp2 = await (
  await fetch(`${BASE}/api/articles`, {
    method: 'POST',
    headers: AUTH,
    body: JSON.stringify({ title: '待删除文章', slug: 'tmp-del-article', content: 'x', status: 'draft' }),
  })
).json();
await page.goto(`${BASE}/admin/?view=posts`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.mng-row[data-slug="tmp-del-article"]');
page.once('dialog', (d) => d.accept());
await page.click('.mng-row[data-slug="tmp-del-article"] [data-act="delete"]');
await sleep(1000);
const gone = await (await fetch(`${BASE}/api/articles/tmp-del-article`)).json();
check('article mgmt delete removes article', !!(gone && gone.error), gone.error || '');
await page.screenshot({ path: path.join(SHOTS, 'admin-manage-posts.png') });

await browser.close();

// restore production protection level before reporting results
let restored = true;
try {
  const r = await fetch(`${BASE}/api/settings`, { method: 'PUT', headers: AUTH, body: JSON.stringify({ protectionLevel: 'high' }) });
  restored = r.ok;
} catch {
  restored = false;
}
if (!restored) console.log('⚠️ 未能恢复防护等级为「高」，请在 管理台 → 站点设置 中手动调回');

const failed = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - failed.length}/${results.length} checks passed =====`);
if (failed.length) {
  console.log('FAILED:', failed.map((f) => f.name).join('; '));
  process.exit(1);
}
