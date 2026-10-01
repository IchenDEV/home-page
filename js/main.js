/**
 * Page controller: loads the GitHub snapshot, renders every section, and wires
 * up the theme switcher, typing intro, tilt cards and keyboard shortcuts.
 */

import { initChat } from './chat.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const GH_USER = 'IchenDEV';

/** Project-specific marks generated for the portfolio's terminal visual system. */
const PROJECT_LOGOS = Object.fromEntries([
  'kite',
  'utter',
  'superman',
  'prompt-optimizer-plugins',
  'larkfs',
  'yemai',
  'roundtable-skill-cloud',
  'petx-desktop',
  'petshare',
  'petx',
  'room-design',
  'gbz185-sdk',
].map((name) => [name, `./assets/project-logos/${name}.png`]));

/**
 * Friend links + my own sites.
 * To add a friend's blog, drop another entry in here — nothing else to change.
 * `{posts}` in a description is filled from the synced blog index.
 */
const LINKS = [
  { name: "idevlab's Blog", url: 'https://blogs.idevlab.dev', desc: '终端风格博客 · {posts} 篇' },
  { name: 'GitHub @IchenDEV', url: 'https://github.com/IchenDEV', desc: '所有开源项目' },
  { name: 'Utter', url: 'https://utter.idevlab.dev', desc: 'macOS 本地语音输入' },
  { name: 'PetX', url: 'https://petx.idevlab.dev', desc: '桌面宠物渲染器' },
  { name: 'Plugin Market', url: 'https://pluginsmp.com/', desc: 'Agent 插件市场' },
  { name: '页脉 Yemai', url: 'https://blogs.idevlab.dev/yemai/', desc: '本地优先的 AI 阅读书架' },
];

/** Rough GitHub language colors for the weight bar. */
const LANG_COLORS = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Swift: '#F05138', Go: '#00ADD8',
  Python: '#3572A5', 'C#': '#178600', 'C++': '#f34b7d', C: '#555555', Rust: '#dea584',
  Vue: '#41b883', HTML: '#e34c26', CSS: '#563d7c', Java: '#b07219', Shell: '#89e051',
  Ruby: '#701516', PHP: '#4F5D95', 'Jupyter Notebook': '#DA5B0B', EJS: '#a91e50',
};
const langColor = (n) => LANG_COLORS[n] || '#8b949e';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/* ------------------------------------------------------------------ theme -- */

const THEMES = ['green', 'amber', 'cyan', 'magenta', 'white'];
const listeners = [];

function getPalette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return {
    green: v('--accent'),
    cyan: v('--muted'),
    bg: v('--paper'),
    line: v('--line'),
    text: v('--ink'),
    isLight: document.documentElement.dataset.terminalTheme === 'white',
  };
}

function setTheme(name) {
  if (!THEMES.includes(name)) name = 'green';
  document.documentElement.dataset.terminalTheme = name;
  const landscape = $('.terminal-footer img');
  const landscapeSrc = `./assets/illustrations/hangzhou-west-lake${name === 'white' ? '' : '-dark'}.webp`;
  if (landscape.getAttribute('src') !== landscapeSrc) landscape.src = landscapeSrc;
  try { localStorage.setItem('terminal-theme', name); } catch {}
  const label = `terminal-${name}`;
  document.querySelectorAll('[data-terminal-theme-current]').forEach((b) => {
    b.textContent = label;
    b.title = label;
    b.setAttribute('aria-label', `Cycle theme, ${label}`);
  });
  // Let the WebGL layers re-read the CSS variables on the next tick.
  requestAnimationFrame(() => listeners.forEach((fn) => fn()));
}

function cycleTheme() {
  const cur = document.documentElement.dataset.terminalTheme;
  setTheme(THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length]);
}

function initTheme() {
  document.querySelectorAll('[data-terminal-theme-current]').forEach((b) => {
    b.addEventListener('click', cycleTheme);
  });
  setTheme(document.documentElement.dataset.terminalTheme || 'green');
}

/* ------------------------------------------------------------------ typed -- */

function initTyping(node) {
  const lines = [
    'hacker & creator — 在杭州写代码。',
    'macOS 原生应用 · SwiftUI · 本地优先。',
    'AI Agent 工具链 & Agent Skills。',
    'code. write. explore. coffee-powered.',
  ];
  if (REDUCED) { node.textContent = lines[0]; return; }

  let li = 0;
  let ci = 0;
  let erasing = false;

  (function tick() {
    const line = lines[li];
    node.textContent = line.slice(0, ci);
    let wait = erasing ? 28 : 52;
    if (!erasing && ci === line.length) { erasing = true; wait = 1900; }
    else if (erasing && ci === 0) { erasing = false; li = (li + 1) % lines.length; wait = 350; }
    else ci += erasing ? -1 : 1;
    setTimeout(tick, wait);
  })();
}

/* ------------------------------------------------------------------ stats -- */

function renderStats(data) {
  const sheet = $('#stat-sheet');
  const since = data.user?.created_at?.slice(0, 4);
  const items = [
    ['Repos', data.stats.public_repos],
    ['Stars', data.stats.stars],
    ['Contribs/yr', data.stats.contributions || null],
    ['Posts', data.stats.posts ?? data.blog?.total ?? null],
    ['Since', since],
  ];
  for (const [label, value] of items) {
    if (value == null) continue;
    const row = el('div');
    row.append(el('dt', null, label), el('dd', null, String(value)));
    sheet.append(row);
  }
}

function renderLanguages(data) {
  const bar = $('#lang-bar');
  const legend = $('#lang-legend');
  if (!data.languages?.length) {
    // The live-API fallback carries no language breakdown; show nothing rather
    // than an empty bar.
    bar.hidden = true;
    return;
  }
  for (const l of data.languages) {
    const seg = el('span');
    seg.style.width = `${l.percent}%`;
    seg.style.background = langColor(l.name);
    seg.title = `${l.name} — ${l.percent}%`;
    bar.append(seg);

    const item = el('span');
    const swatch = el('i');
    swatch.style.background = langColor(l.name);
    item.append(swatch, document.createTextNode(`${l.name} ${l.percent}%`));
    legend.append(item);
  }
}

/* --------------------------------------------------------------- projects -- */

const rtf = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });
function ago(iso) {
  const diff = (new Date(iso) - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, s] of units) {
    if (Math.abs(diff) >= s || unit === 'minute') return rtf.format(Math.round(diff / s), unit);
  }
  return '刚刚';
}

/** 2026-09-30 / ISO timestamp -> 2026.09.30, the blog's date style. */
const dotDate = (value) => String(value).slice(0, 10).replaceAll('-', '.');

function externalLink(cls, text, href) {
  const a = el('a', cls, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

function timeEl(value) {
  const t = el('time', null, dotDate(value));
  t.dateTime = String(value);
  return t;
}

function renderProjects(data) {
  const list = $('#projects-list');
  for (const repo of data.repos) {
    const row = el('article', 'mail-row');

    const logo = el('span', 'mail-logo');
    logo.setAttribute('aria-hidden', 'true');
    const logoPath = PROJECT_LOGOS[repo.name];
    if (logoPath) {
      const image = el('img');
      image.src = logoPath;
      image.alt = '';
      image.width = 44;
      image.height = 44;
      image.loading = 'lazy';
      image.decoding = 'async';
      logo.append(image);
    } else {
      logo.textContent = repo.name.slice(0, 2).toUpperCase();
    }

    const preview = el('div', 'mail-preview');
    preview.append(
      externalLink('mail-subject', repo.name, repo.url),
      el('span', 'mail-excerpt', repo.description || ''),
    );

    const meta = el('div', 'mail-meta');
    if (repo.pinned) meta.append(el('span', 'pin', '[pinned]'));
    if (repo.language) {
      const lang = el('span');
      const dot = el('i', 'dot');
      dot.style.background = langColor(repo.language);
      lang.append(dot, document.createTextNode(repo.language));
      meta.append(lang);
    }
    if (repo.stars) meta.append(el('span', null, `★ ${repo.stars}`));
    for (const t of repo.topics || []) meta.append(el('span', null, `#${t}`));
    if (repo.homepage) meta.append(externalLink(null, 'live ↗', repo.homepage));
    preview.append(meta);

    const pushed = timeEl(repo.pushed_at);
    pushed.title = ago(repo.pushed_at);
    row.append(logo, preview, pushed);
    list.append(row);
  }
}

/* ------------------------------------------------------------------ posts -- */

function renderPosts(data) {
  const section = $('#posts');
  const list = $('#posts-list');
  const posts = data.blog?.posts || [];
  if (!posts.length) {
    section.hidden = true;
    return;
  }

  for (const post of posts) {
    const row = el('article', 'mail-row');
    const tag = el('span', 'mail-sender', post.tags?.[0] ? `#${post.tags[0]}` : 'idevlab');
    const preview = el('div', 'mail-preview');
    preview.append(externalLink('mail-subject', post.title, post.url));
    if (post.excerpt) preview.append(el('span', 'mail-excerpt', post.excerpt));
    row.append(tag, preview, timeEl(post.date));
    list.append(row);
  }
}

/* --------------------------------------------------------------- activity -- */

function renderActivity(data) {
  const list = $('#activity-list');
  if (!data.activity.length) {
    list.append(el('li', null, '暂无最近公开活动'));
    return;
  }
  for (const a of data.activity) {
    const li = el('li');
    const when = el('time', 'when', ago(a.at));
    when.dateTime = a.at;
    when.title = a.at;
    const what = el('span', 'what');
    what.append(document.createTextNode(`${a.verb} `), externalLink('where', a.repo, `https://github.com/${a.repo}`));
    li.append(when, what);
    list.append(li);
  }
}

/* ------------------------------------------------------------------ links -- */

function renderLinks(data) {
  const grid = $('#link-grid');
  const posts = data?.stats?.posts ?? data?.blog?.total;
  for (const l of LINKS) {
    let desc = l.desc || l.url;
    if (desc.includes('{posts}')) {
      desc = posts ? desc.replace('{posts}', String(posts)) : desc.replace(/\s*·\s*\{posts\}.*$/, '');
    }
    const a = externalLink(null, null, l.url);
    a.append(el('span', null, l.name), el('em', null, desc));
    grid.append(a);
  }
}

/* ------------------------------------------------------------------- sync -- */

/** Show when each source was last refreshed, so stale data is never silent. */
function renderSync(data) {
  const box = $('#sync-status');
  const sync = data.sync || {};
  const rows = [
    ['github', sync.github_at || data.generated_at],
    ['blog', sync.blog_at],
  ];
  for (const [label, at] of rows) {
    if (!at) continue;
    const dd = el('dd');
    const t = el('time', null, ago(at));
    t.dateTime = at;
    t.title = at;
    dd.append(t);
    box.append(el('dt', null, `${label} sync`), dd);
  }
}

/* --------------------------------------------------------------- contrib --- */

function renderContribMeta(data, ramp) {
  const days = data.contributions.days;
  if (!days.length) {
    $('#contrib-total').textContent = '贡献数据暂不可用';
    return;
  }
  $('#contrib-total').textContent = `过去一年 ${data.contributions.total} 次贡献`;

  // Longest run of consecutive active days.
  let best = 0;
  let run = 0;
  for (const d of days) {
    run = d.count > 0 ? run + 1 : 0;
    if (run > best) best = run;
  }
  $('#contrib-streak').textContent = `最长连续 ${best} 天`;

  if (ramp) {
    document.querySelectorAll('.contrib-foot .legend i').forEach((i, idx) => {
      i.style.background = `#${ramp[idx].getHexString()}`;
    });
  }
}

/* ----------------------------------------------------------------- chrome -- */

const SECTIONS = ['home', 'projects', 'posts', 'activity', 'links'];

/** Mark the sidebar entry for the section currently in view, like the blog's `>`. */
function initNavSpy() {
  const links = new Map(
    [...document.querySelectorAll('[data-terminal-nav]')].map((a) => [a.dataset.terminalNav, a]),
  );
  const select = (id) => {
    for (const [key, a] of links) {
      const on = key === id;
      a.querySelector('.nav-marker').textContent = on ? '>' : '';
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) select(e.target.id);
  }, { rootMargin: '-40% 0px -55% 0px' });
  SECTIONS.forEach((id) => {
    const n = document.getElementById(id);
    if (n) io.observe(n);
  });
}

/** Same muscle memory as the blog: j/k, gg/G, g+letter jumps, t for theme. */
function initKeys(chat) {
  const GOTO = { h: 'home', p: 'projects', b: 'posts', a: 'activity', l: 'links' };
  const behavior = () => (REDUCED ? 'auto' : 'smooth');
  const root = () => document.scrollingElement || document.documentElement;
  let pending = 0;

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;

    if (pending) {
      clearTimeout(pending);
      pending = 0;
      if (e.key === 'g') root().scrollTo({ top: 0, behavior: behavior() });
      else if (GOTO[e.key]) document.getElementById(GOTO[e.key])?.scrollIntoView({ behavior: behavior() });
      else return;
      e.preventDefault();
      return;
    }

    const page = Math.round(window.innerHeight * 0.85);
    if (e.key === 'j') root().scrollBy({ top: page, behavior: behavior() });
    else if (e.key === 'k') root().scrollBy({ top: -page, behavior: behavior() });
    else if (e.key === 'G') root().scrollTo({ top: root().scrollHeight, behavior: behavior() });
    else if (e.key === 'g') pending = setTimeout(() => { pending = 0; }, 1200);
    else if (e.key === 't') cycleTheme();
    else if (e.key === 'c') chat.open();
    else return;
    e.preventDefault();
  });
}

/* ------------------------------------------------------------------- boot -- */

async function loadData() {
  // Prefer the snapshot refreshed by GitHub Actions. The live GitHub API is
  // only a final fail-safe when the committed file is unavailable.
  try {
    const res = await fetch('./data/github.json', { cache: 'no-cache' });
    if (res.ok) return await res.json();
  } catch {}
  return loadLive();
}

/** Minimal live fallback so the page is never empty. */
async function loadLive() {
  const [user, repos] = await Promise.all([
    fetch(`https://api.github.com/users/${GH_USER}`).then((r) => r.json()),
    fetch(`https://api.github.com/users/${GH_USER}/repos?per_page=100&sort=pushed`).then((r) => r.json()),
  ]);
  const own = Array.isArray(repos) ? repos.filter((r) => !r.fork) : [];
  return {
    generated_at: new Date().toISOString(),
    user,
    stats: {
      public_repos: user.public_repos || 0,
      stars: own.reduce((n, r) => n + r.stargazers_count, 0),
      contributions: 0,
    },
    languages: [],
    repos: own.filter((r) => r.description).slice(0, 12).map((r) => ({
      name: r.name, description: r.description, language: r.language,
      stars: r.stargazers_count, topics: (r.topics || []).slice(0, 4),
      url: r.html_url, homepage: r.homepage, pushed_at: r.pushed_at, pinned: false,
    })),
    contributions: { total: 0, days: [] },
    activity: [],
    blog: { url: 'https://blogs.idevlab.dev', posts: [] },
  };
}

// Optional 3D modules must never hold up page content or controls.
function whenVisible(target, initialize) {
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    initialize().catch((err) => console.warn('3D scene unavailable', err));
  }, { rootMargin: '200px' });
  observer.observe(target);
}

async function boot() {
  initTheme();
  initTyping($('#typed'));
  const chat = initChat();
  initKeys(chat);
  document.querySelectorAll('[data-chat-open]').forEach((b) => {
    b.addEventListener('click', () => chat.open());
  });
  $('#year').textContent = String(new Date().getFullYear());
  initNavSpy();

  let data;
  try {
    data = await loadData();
  } catch (err) {
    console.error('data load failed', err);
    renderLinks(null);
    return;
  }

  renderStats(data);
  renderLanguages(data);
  renderProjects(data);
  renderPosts(data);
  renderActivity(data);
  renderLinks(data);
  renderSync(data);

  whenVisible($('#hero-canvas'), async () => {
    const { initHeroScene } = await import('./scene.js');
    const hero = initHeroScene($('#hero-canvas'), { getPalette });
    if (!hero) return;
    listeners.push(hero.refreshPalette);
    const onScroll = () => {
      hero.setScroll(Math.min(1.6, window.scrollY / Math.max(1, window.innerHeight)));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  });

  // A 53-week strip inside a phone-width canvas renders as unreadable specks,
  // so narrow screens get the most recent half-year instead.
  const allDays = data.contributions.days;
  // Without a calendar (live-API fallback) the whole section would be an empty
  // frame, so drop it rather than show a hollow box.
  if (!allDays.length) $('.contrib-wrap').hidden = true;
  const narrow = window.innerWidth < 700;
  let shownDays = allDays;
  if (narrow && allDays.length > 26 * 7) {
    // Trim to a week boundary so index % 7 still maps to the weekday.
    const start = allDays.length - 26 * 7;
    shownDays = allDays.slice(start - (start % 7));
    $('#contrib-range').textContent = '· 小屏显示近半年';
  }

  renderContribMeta(data);
  if (shownDays.length) {
    whenVisible($('#contrib-canvas'), async () => {
      const { initContribScene } = await import('./contrib3d.js');
      const contrib = initContribScene($('#contrib-canvas'), shownDays, {
        getPalette,
        tooltip: $('#contrib-tip'),
      });
      if (!contrib) return;
      renderContribMeta(data, contrib.ramp);
      listeners.push(() => renderContribMeta(data, contrib.refreshPalette()));
    });
  }
}

boot();
