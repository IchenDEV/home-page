/**
 * Page controller: loads the GitHub snapshot, renders every section, and wires
 * up the theme switcher, typing intro, tilt cards and keyboard shortcuts.
 */

import { initHeroScene } from './scene.js';
import { initContribScene } from './contrib3d.js';
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
 */
const LINKS = [
  // `badge` is a short ASCII monogram — emoji would fall back to tofu on some
  // systems and reads foreign next to the monospace type anyway.
  { name: "idevlab's Blog", url: 'https://blogs.idevlab.dev', desc: '我的博客 · 终端风格 · 89 篇', badge: '>_' },
  { name: 'GitHub @IchenDEV', url: 'https://github.com/IchenDEV', desc: '所有开源项目', badge: 'gh' },
  { name: 'Utter', url: 'https://utter.idevlab.dev', desc: 'macOS 本地语音输入', badge: 'ut' },
  { name: 'PetX', url: 'https://petx.idevlab.dev', desc: '桌面宠物渲染器', badge: 'px' },
  { name: 'Plugin Market', url: 'https://pluginsmp.com/', desc: 'Agent 插件市场', badge: 'mk' },
  { name: '页脉 Yemai', url: 'https://blogs.idevlab.dev/yemai/', desc: '本地优先的 AI 阅读书架', badge: 'ym' },
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
    green: v('--terminal-green'),
    cyan: v('--terminal-cyan'),
    bg: v('--terminal-bg'),
    line: v('--terminal-line'),
    text: v('--terminal-text'),
    isLight: document.documentElement.dataset.terminalTheme === 'white',
  };
}

function setTheme(name) {
  if (!THEMES.includes(name)) return;
  document.documentElement.dataset.terminalTheme = name;
  try { localStorage.setItem('terminal-theme', name); } catch {}
  document.querySelectorAll('[data-theme-choice]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.themeChoice === name));
  });
  // Let the WebGL layers re-read the CSS variables on the next tick.
  requestAnimationFrame(() => listeners.forEach((fn) => fn()));
}

function initTheme() {
  document.querySelectorAll('[data-theme-choice]').forEach((b) => {
    b.addEventListener('click', () => setTheme(b.dataset.themeChoice));
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

/* ------------------------------------------------------------------ about -- */

function renderStats(data) {
  const wrap = $('#stats');
  const items = [
    ['公开仓库', data.stats.public_repos],
    ['年度贡献', data.stats.contributions],
  ];
  for (const [label, value] of items) {
    const box = el('div', 'stat');
    const v = el('div', 'stat-value', '0');
    box.append(v, el('div', 'stat-label', label));
    wrap.append(box);
    countUp(v, value);
  }
}

/** Count-up that only runs once the tile scrolls into view. */
function countUp(node, target) {
  if (REDUCED) { node.textContent = String(target); return; }
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    const dur = 1100;
    const t0 = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      node.textContent = String(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }, { root: $('#viewport'), threshold: 0.4 });
  io.observe(node);
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

function renderProjects(data) {
  const grid = $('#projects-grid');
  for (const repo of data.repos) {
    const card = el('article', 'card reveal');

    const top = el('div', 'card-top');
    const logo = el('a', 'card-logo');
    logo.href = repo.url;
    logo.target = '_blank';
    logo.rel = 'noopener';
    logo.setAttribute('aria-label', `打开 ${repo.name} 项目`);
    const logoPath = PROJECT_LOGOS[repo.name];
    if (logoPath) {
      const image = el('img');
      image.src = logoPath;
      image.alt = '';
      image.width = 320;
      image.height = 320;
      image.loading = 'lazy';
      image.decoding = 'async';
      logo.append(image);
    } else {
      logo.classList.add('card-logo-fallback');
      logo.textContent = repo.name.slice(0, 2).toUpperCase();
    }
    const name = el('a', 'card-name', repo.name);
    name.href = repo.url;
    name.target = '_blank';
    name.rel = 'noopener';
    top.append(logo, name);
    if (repo.pinned) top.append(el('span', 'card-pin', 'PINNED'));

    const desc = el('p', 'card-desc', repo.description || '');

    const topics = el('div', 'card-topics');
    for (const t of repo.topics) topics.append(el('span', null, `#${t}`));

    const foot = el('div', 'card-foot');
    if (repo.language) {
      const lang = el('span');
      const dot = el('i', 'dot');
      dot.style.background = langColor(repo.language);
      lang.append(dot, document.createTextNode(repo.language));
      foot.append(lang);
    }
    foot.append(el('span', null, ago(repo.pushed_at)));

    const links = el('div', 'card-links');
    if (repo.homepage) {
      const live = el('a', null, 'live ↗');
      live.href = repo.homepage;
      live.target = '_blank';
      live.rel = 'noopener';
      links.append(live);
    }
    const code = el('a', null, 'code ↗');
    code.href = repo.url;
    code.target = '_blank';
    code.rel = 'noopener';
    links.append(code);
    foot.append(links);

    card.append(top, desc, topics, foot);
    grid.append(card);
    attachTilt(card);
  }
}

/* ------------------------------------------------------------------- blog -- */

function renderBlog(data) {
  const section = $('#blog');
  const grid = $('#blog-grid');
  const posts = data.blog?.posts || [];
  if (!posts.length) {
    section.hidden = true;
    return;
  }

  for (const post of posts) {
    const card = el('article', 'blog-card panel reveal');
    const date = el('time', 'blog-date', post.date);
    date.dateTime = post.date;

    const title = el('a', 'blog-title', post.title);
    title.href = post.url;
    title.target = '_blank';
    title.rel = 'noopener';

    const excerpt = el('p', 'blog-excerpt', post.excerpt || '');
    const tags = el('div', 'blog-tags');
    for (const tag of post.tags || []) tags.append(el('span', null, `#${tag}`));

    const read = el('a', 'blog-read', 'read ↗');
    read.href = post.url;
    read.target = '_blank';
    read.rel = 'noopener';
    card.append(date, title, excerpt, tags, read);
    grid.append(card);
  }
}

/** Pointer-tracked 3D tilt + sheen. Skipped on touch and reduced-motion. */
function attachTilt(card) {
  if (REDUCED || !window.matchMedia('(hover: hover)').matches) return;
  const MAX = 8;
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    card.style.setProperty('--mx', `${px * 100}%`);
    card.style.setProperty('--my', `${py * 100}%`);
    card.style.transform =
      `perspective(900px) rotateX(${(0.5 - py) * MAX}deg) rotateY(${(px - 0.5) * MAX}deg) translateZ(12px)`;
  });
  card.addEventListener('pointerleave', () => { card.style.transform = ''; });
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
    li.append(el('span', 'when', ago(a.at)));
    const what = el('span', 'what');
    what.append(document.createTextNode(`${a.verb} `));
    const where = el('a', 'where', a.repo);
    where.href = `https://github.com/${a.repo}`;
    where.target = '_blank';
    where.rel = 'noopener';
    what.append(where);
    li.append(what);
    list.append(li);
  }
}

/* ------------------------------------------------------------------ links -- */

function renderLinks() {
  const grid = $('#link-grid');
  for (const l of LINKS) {
    const a = el('a', 'link-card reveal');
    a.href = l.url;
    a.target = '_blank';
    a.rel = 'noopener';

    const av = el('div', 'link-avatar');
    if (l.avatar) {
      const img = el('img');
      img.src = l.avatar;
      img.alt = '';
      img.loading = 'lazy';
      av.append(img);
    } else {
      av.textContent = l.badge || l.name.slice(0, 1).toUpperCase();
    }

    const body = el('div');
    body.append(el('div', 'link-name', l.name), el('div', 'link-desc', l.desc || l.url));
    a.append(av, body);
    grid.append(a);
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

function initReveal() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }
  }, { root: $('#viewport'), threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((n) => io.observe(n));
}

/** Highlight the section currently in view. */
function initNavSpy() {
  const links = [...document.querySelectorAll('.site-nav a[href^="#"]')];
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      links.forEach((a) => a.classList.remove('is-active'));
      map.get(e.target.id)?.classList.add('is-active');
    }
  }, { root: $('#viewport'), rootMargin: '-45% 0px -50% 0px' });
  ['about', 'projects', 'blog', 'contrib', 'links'].forEach((id) => {
    const n = document.getElementById(id);
    if (n) io.observe(n);
  });
}

/** j/k scroll, g/G jump, t cycles theme — same muscle memory as the blog. */
function initKeys(viewport) {
  let lastG = 0;
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === 'j') { viewport.scrollBy({ top: 90, behavior: 'auto' }); e.preventDefault(); }
    else if (e.key === 'k') { viewport.scrollBy({ top: -90, behavior: 'auto' }); e.preventDefault(); }
    else if (e.key === 'G') { viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' }); }
    else if (e.key === 'g') {
      const now = Date.now();
      if (now - lastG < 500) viewport.scrollTo({ top: 0, behavior: 'smooth' });
      lastG = now;
    } else if (e.key === 't') {
      const cur = document.documentElement.dataset.terminalTheme;
      setTheme(THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length]);
    }
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

async function boot() {
  initTheme();
  initTyping($('#typed'));
  initKeys($('#viewport'));
  const chat = initChat();
  document.querySelectorAll('[data-chat-open]').forEach((b) => {
    b.addEventListener('click', () => chat.open());
  });
  renderLinks();
  $('#year').textContent = String(new Date().getFullYear());

  // Hero scene first — it is the thing people see while data loads.
  const hero = initHeroScene($('#hero-canvas'), { getPalette });
  if (hero) {
    listeners.push(hero.refreshPalette);
    const viewport = $('#viewport');
    const onScroll = () => {
      const max = Math.max(1, window.innerHeight);
      hero.setScroll(Math.min(1.6, viewport.scrollTop / max));
    };
    viewport.addEventListener('scroll', onScroll, { passive: true });
  }

  let data;
  try {
    data = await loadData();
  } catch (err) {
    console.error('data load failed', err);
    return;
  }

  renderStats(data);
  renderLanguages(data);
  renderProjects(data);
  renderBlog(data);
  renderActivity(data);

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

  const contrib = initContribScene($('#contrib-canvas'), shownDays, {
    getPalette,
    tooltip: $('#contrib-tip'),
  });
  if (contrib) {
    listeners.push(() => {
      const ramp = contrib.refreshPalette();
      renderContribMeta(data, ramp);
    });
  }
  renderContribMeta(data, contrib?.ramp);

  if (data.generated_at) {
    const githubAt = data.sync?.github_at?.slice(0, 10);
    const blogAt = data.sync?.blog_at?.slice(0, 10);
    $('#build-stamp').textContent = githubAt && blogAt
      ? `github ${githubAt} · blog ${blogAt}`
      : `data synced ${data.generated_at.slice(0, 10)}`;
  }

  initReveal();
  initNavSpy();
}

boot();
